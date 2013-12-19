// configure me!
var baseURL = '/solr/vep';
var configURL = 'config.xml';

// global variables
var queryParams = {};   // URL params
var globalStore = {};   // general misc global store, could maybe use window instead?
var logicGroups = [];   // logic groups for logic editor
var fieldInfo = {};     // field information
var groups = [];        // field groupings

$(document).ready(function() {
  
  // initialise QueryString
  updateQueryString();
  
  // parse configuration from XML
  parseConfig(configURL);
  
  // get fields
  getFields();
  
  // do an initial blank search
  doSearch();
  
  // init buttons
  initButtons();
});

function parseConfig(url) {
  $.ajax({
    url: url,
    type: 'GET',
    dataType: 'xml',
    async: false,
    
    success: function( xmlText ) {
      
      // convert to jQuery object
      var xml = $(xmlText);
      
      // get hidden states from cookie
      var hiddenCookie = readCookie('hidden');
      var hidden = {};
      if(hiddenCookie) {
        hidden = $.parseJSON(hiddenCookie);
      }
      
      xml.find('group').each(function() {
        var group = {name: $(this).attr('name'), subs: []};
        
        $(this).find('sub').each(function() {
          var sub = $(this).attr('name');
          group.subs.push(sub);
          
          var order = 1;
          
          $(this).find('field').each(function() {
            
            // range is stored as comma-separated list
            var range = [];
            if($(this).attr('range')) range = $(this).attr('range').split(",");
            
            var name = $(this).attr('name');
            
            fieldInfo[name] = {
              group: group.name,
              sub: sub,
              
              label: $(this).attr('label'),
              header: $(this).attr('header'),
              range: range,
              order: order++
            };
            
            if(hidden.hasOwnProperty(name)) {
              fieldInfo[name].hidden = true;
            }
          })
        })
        
        groups.push(group);
      });
      
      // get order from cookie
      var orderCookie = readCookie('order');
      var order = [];
      
      if(orderCookie) {
        order = $.parseJSON(orderCookie);
      }
      
      // otherwise construct it from the order specified in config XML
      else {
        var fields = [];
        for(var k in fieldInfo) fields.push(k);
        fields = fields.sort(function(a,b) { return (fieldInfo[a].order || 999) - (fieldInfo[b].order || 999) });
        
        for(var i=0; i<groups.length; i++) {
          var group = groups[i];
          
          for(var j=0; j<groups[i].subs.length; j++) {
            for(var k=0; k<fields.length; k++) {
              var field = fields[k];
              var thisSub = fieldInfo[field].sub || 'Other';
              
              if(fieldInfo[field].group === group.name && thisSub === groups[i].subs[j]) {
                order.push(field);
              }
            }
          }
        }
      }
      
      // store order
      globalStore.order = order;
      updateCookies();
    },
    
    error: function( xhr, status ) {
      $('body').append('<div id="dialog-error" title="Configuration error">Could not load configuration from ' + url + '</div>');
      $('#dialog-error').dialog({
        resizable: false,
        modal: true,
        buttons: {
          "OK": function() {
            $(this).dialog("close");
          }
        }
      });
    }
  });
}

function createFooter(json) {
  var numDocs = json.index.numDocs;
  var numFields = Object.keys(json.fields).length;
  var updated = json.index.lastModified;
  
  $('.footer-stats').empty().append(
    '<b>Number of documents:</b> ' + numDocs + ' | ' +
    '<b>Number of fields:</b> ' + numFields + ' | ' +
    '<b>Last updated:</b> ' + updated
  );
}

function getFields() {
  $.ajax({
    url: baseURL + '/admin/luke',
    type: 'GET',
    dataType: 'json',
    
    data: {
      wt: 'json'
    },
    
    success: function( json ) {
      
      // write footer
      createFooter(json);
      
      $('.search').empty();
      
      $('.search').append('<div id="accordion">');
      
      for(var i=0; i<groups.length; i++) {
        $('#accordion').append('<h3>' + groups[i].name + '</h3>' + '<div class="' + groups[i].name + '"></div>');
        
        for(var j=0; j<groups[i].subs.length; j++) {
          $('.' + groups[i].name).append(
            '<div class="sub-container ' + groups[i].name + '_' + groups[i].subs[j].replace(" ", "_") + '">' +
            '<div class="sub-label">' + groups[i].subs[j] + '</div></div>'
          );
        }
      }
      
      // add logic editor
      $('#accordion').append('<h3 id="logic-header">Edit logic</h3>' + '<div class="logic-container"><div class="logic-groups-container">No fields selected yet</div></div>');
     
      $('.logic-container').append('<div class="add-logic-group hidden"><a href="#" class="button add-logic-button">Add group</a>');
      $('.add-logic-button').button().on('click', function(event) {
        var group = {
          innerLogic: 'AND',
          outerLogic: 'AND',
          id: logicGroups.length,
          fields: []
        };
        logicGroups.push(group);
        
        renderLogicGroup(group);
      });
      
      // add fields
      var fields = [];
      for(var k in json.fields) {
        if(!fieldInfo[k]) continue;
        fields.push(k);
      }
      
      // sort fields using order from config
      fields = fields.sort(function(a,b) { return (fieldInfo[a].order || 999) - (fieldInfo[b].order || 999) });
      
      for(var k=0; k<fields.length; k++) {
        var key = fields[k];
        var field = json.fields[key];
        var type = field.type;
        if(!fieldInfo[key]) continue;
        var group = fieldInfo[key].group + "_" + (fieldInfo[key].sub || 'Other').replace(" ", "_");
        
        // store type and whether it's a multi index
        fieldInfo[key].type = type;
        fieldInfo[key].multi = field.schema.match(/M/) ? true : false;
        
        $('.' + group).append(
          '<div class="field-container" id="' + key + '-container"><label class="field-label">' +
          '<input class="check" type="checkbox" name="check_' + key + '">' + (fieldInfo[key].label || key) + '</label>' +
          '<input id="' + key + '" type="text" name="' + key + '" ' + (type === 'string' ? 'class="ac field"' : 'class="field"') + '/>'
        );
        
        createSlider(type, key);
      }
      
      // enable accordion
      $(function() {
        $( "#accordion" ).accordion({
          collapsible: true,
          heightStyle: "content"
        });
      });
      
      initFieldHandlers();
    },
    
    error: function(xhr, status ) {
      console.log("Failed to get fields");
    }
  });
}

// function to intialise handlers for user interaction with input fields
function initFieldHandlers() {
  
  // field handlers
  $('.field').on('focus', function() {
    var name = this.name;
    var check  = $('[name="check_' + name + '"]');
    check.prop('checked', true);
    
    var slider = $('#' + name + '-slider-container');
    check.prop('checked') ? slider.removeClass('hidden') : slider.addClass('hidden');
  }).on('keyup', function(e) {
    queryParams[this.name] = this.value;
    updateQueryString();
    
    if(this.value.match(/\[.+? TO .+?\]/)) {
      var values = this.value.split(/(\[| TO |\])/);
      
      if($(this).prop("rel") == 'int') {
        $("#slide_" + this.name).slider( "values", [values[2], values[4]] );
      }
      else {
        $("#slide_" + this.name).slider( "values", [values[2] * 1000, values[4] * 1000] );
      }
    }
    //if(e.keyCode === 13) {
    //  doSearch();
    //}
  }).on('blur', function() {
    queryParams[this.name] = this.value;
    updateQueryString();
    //doSearch();
  }).on('change', function() {
    queryParams[this.name] = this.value;
    updateQueryString();
  });
  
  // update QueryString on check on/off
  $('.check').on('change', function() {
    updateQueryString();
    
    var name = this.name.replace('check_', '');
    
    var slider = $('#' + name + '-slider-container');
    $(this).prop('checked') ? slider.removeClass('hidden') : slider.addClass('hidden');
  });
  
  $(window).bind('hashchange', function() {
    getQueryStringFromWindowHash();
  });
  
  // update fields on QueryString change
  $('#url-value')
  .on('blur', function() {
    parseEditedQueryString(false);
  })
  .on('keyup', function() {
    parseEditedQueryString(true);
  });
  
  // initialise auto-completes
  $('.ac').on('focus', function() {
    var fieldName = this.name;
    var input = $(this);
    
    var source = [];
    
    $.ajax({
      url: baseURL + '/admin/luke',
      type: 'GET',
      dataType: 'json',
      
      data: {
        wt: 'json',
        fl: fieldName,
        numTerms: 100
      },
      
      success: function( fl ) {
        var distinct;
        
        for(var key in fl.fields) {
          var field = fl.fields[key];
          distinct = field.distinct;
          
          if(field.topTerms) {
            for (var i=0; i<field.topTerms.length; i+=2) {
              source.push(unescape(field.topTerms[i]));
            }
          }
        }
        
        if(distinct > 100) {
          input.keyup(function() {
            
            if(this.value.length && this.value != this.rel) {
              
              this.rel = this.value;
              
              // multi field, do normal search
              if(fieldInfo[fieldName].multi) {                
                $.ajax({
                  url: baseURL + '/select',
                  type: 'GET',
                  dataType: 'json',
                  
                  data: {
                    wt: 'json',
                    q: this.name + ":*" + this.value + "*",
                    rows: 100
                  },
                  
                  success: function( res ) {
                    source = [];
                    
                    for(var i=0; i<res.response.docs.length; i++) {
                      source.push(unescape(res.response.docs[i][fieldName]));
                    }
                    
                    input.autocomplete({
                      source: source,
                      minLength: 0
                    });
                  },
                  
                  error: function( xhr, status ) {
                    console.log("Error doing search for " + this.q);
                  }
                });
              }
              
              // non-multi field, do group search
              else {
                $.ajax({
                  url: baseURL + '/select',
                  type: 'GET',
                  dataType: 'json',
                  
                  data: {
                    wt: 'json',
                    q: this.name + ":*" + this.value + "*",
                    rows: 100,
                    group: true,
                    'group.field': this.name
                  },
                  
                  success: function( res ) {
                    source = [];
                    
                    for(var key in res.grouped) {
                      for(var i=0; i<res.grouped[key].groups.length; i++) {
                        source.push(unescape(res.grouped[key].groups[i].groupValue));
                      }
                      input.autocomplete({
                        source: source,
                        minLength: 0
                      });
                    }
                  },
                  
                  error: function( xhr, status ) {
                    console.log("Error doing group search for " + this.q);
                  }
                });
              }
            }
          });
        }
        
        else {
          input.autocomplete({
            source: source,
            minLength: 0
          });
        }
      }
    });
  });
  
  getQueryStringFromWindowHash();
}

// create jQueryUI slides for numeric fields
function createSlider(type, key) {
  
  // create slider for int types
  if(type === 'int') {
    
    // loading placeholder
    $('#' + key + '-container').append('<div class="slider-container hidden" id="' + key + '-slider-container"><img src="img/ajax-loader.gif"/> <small>Loading stats</small>');
    
    // request min/max from stats
    $.ajax({
      url: baseURL + '/select',
      type: 'GET',
      dataType: 'json',
      
      data: {
        wt: 'json',
        q: '*:*',
        rows: 0,
        stats: true,
        "stats.field": key
      },
      
      key: key,
      
      success: function( r ) {
        $('#' + this.key + '-slider-container').empty().append('<div rel="' + type + '" class="slider" id="slide_' + this.key + '">');
        $("#slide_" + this.key).slider({
          range: true,
          min: r.stats.stats_fields[this.key].min,
          max: r.stats.stats_fields[this.key].max,
          slide: function( event, ui ) {
            var f = this.id.replace('slide_', '');
            $('#' + f).val("[" + ui.values[0] + " TO " + ui.values[1] + "]");
            queryParams[f] = $('#' + f).val();
            updateQueryString();
          }
        });
      },
      
      error: function( xhr, status ) {
        console.log("Error");
      }
    });
  }
  
  // sliders for fields with defined ranges
  else if(fieldInfo[key].range && fieldInfo[key].range.length) {
    $('#' + key + '-container').append('<div class="slider-container hidden" id="' + key + '-slider-container">');
    $('#' + key + '-slider-container').empty().append('<div class="slider" id="slide_' + key + '">');
    $("#slide_" + key).slider({
      range: true,
      min: fieldInfo[key].range[0] * 1000,
      max: fieldInfo[key].range[1] * 1000,
      slide: function( event, ui ) {
        var f = this.id.replace('slide_', '');
        $('#' + f).val("[" + (ui.values[0] / 1000) + " TO " + (ui.values[1] / 1000) + "]");
        queryParams[f] = $('#' + f).val();
        updateQueryString();
      }
    });
  }
}

function initButtons() {
  
  // search button
  $('.search-button').button().click(function(event) {
    event.preventDefault();
    
    window.location.hash = createQueryString();
    doSearch();
  });
  
  // reset button
  $('.reset-button').button().click(function(event) {
    event.preventDefault();
    
    $('body').append('<div id="dialog-confirm" title="Reset the form?"></div>');
    $('#dialog-confirm').dialog({
      resizable: false,
      height: 140,
      modal: true,
      buttons: {
        "Reset": function() {
          event.preventDefault();
          queryParams = {};
          logicGroups = [];
          for(var k in fieldInfo) {
            fieldInfo[k].logicGroup = undefined;
          }
          updateQueryString();
          getFields();
          window.location.hash = '';
          doSearch();
          $(this).dialog("close");
        },
        "Cancel": function() {
          $(this).dialog("close");
        }
      }
    });
  });
  
  // hide button - hides LH search panel
  $('.hide-button').button().click(function(event) {
    event.preventDefault();
    
    var resultsDiv = $('.results-container');
    var searchContainerDiv = $('.search-container');
    var searchDiv = $('.search');
    
    // show
    if(searchDiv.hasClass('hidden')) {
      searchDiv.removeClass('hidden');
      searchContainerDiv.css('width', globalStore.searchWidth);
      resultsDiv.css('margin-left', globalStore.resultsMargin);
      
      $(this).empty().append('<span class="ui-button-text">&lt; Hide</span>');
    }
    
    // hide
    else {
      var currentWidth = searchContainerDiv.css('width');
      var currentMargin = resultsDiv.css('margin-left');
      resultsDiv.css('margin-left', '60px');
      
      searchDiv.addClass('hidden')
      searchContainerDiv.css('width', '');
      
      // use globalStore to remember initial sizes
      globalStore.searchWidth = currentWidth;
      globalStore.resultsMargin = currentMargin;
      
      $(this).empty().append('<span class="ui-button-text">&gt;</span>');
    }
  });
}


// main search function
// passes on to renderResults
function doSearch() {
  $('.results').empty().append('<img src="img/ajax-loader.gif"/> Searching');
  
  var url = $('#url-value').prop('value');
  
  $.ajax({
    url: url,
    type: 'GET',
    dataType: 'text',
    
    data: {
      wt: 'json',
      indent: true,
      rows: 10
    },
    
    success: function( text ) {
      renderResults(text);
    },
    
    error: function(xhr, status) {
      $('.results').empty().append('Search failed: ' + xhr.statusText);
    }
  });
}

// updates QueryString and logic diagram
function updateQueryString(noRedraw) {
  
  // render groups
  renderAllLogicGroups(noRedraw);
  
  // update QueryString field
  setQueryURL(createQueryString());
}

// creates query string from queryParams and logicGroups
function createQueryString() {
  var qString = '';
  
  // init logicGroups
  if(!logicGroups.length) {
    logicGroups.push({
      innerLogic: 'AND',
      outerLogic: 'AND',
      id: 0,
      fields: []
    });
  }
  
  // drop fields into default logic group
  for(var key in queryParams) {
    if(typeof fieldInfo[key].logicGroup === 'undefined') {
      fieldInfo[key].logicGroup = 0;
      logicGroups[0].fields.push(key);
    }
  }
  
  for(var i=0; i<logicGroups.length; i++) {
    var group = logicGroups[i];
    if(!group.fields.length) continue;
    
    var qStringPart = '';
    
    for(var j=0; j<group.fields.length; j++) {
      var key = group.fields[j];
      
      // check if it's checked
      if($('[name=check_' + key + ']').prop('checked') && queryParams[key].length) {
        qStringPart = qStringPart + (qStringPart.length ? ' ' + group.innerLogic + ' ' : '') + key + ':' + queryParams[key].replace(':', '\:');
      }
    }
    
    if(qStringPart.length) {
      qString = qString.length ? qString + ' ' + group.outerLogic + ' (' : '(';
      qString = qString + qStringPart;
      qString = qString + ')';
    }
  }
  
  return qString;
}

// set the Solr URL from a query string
function setQueryURL(qString) {
  var newValue;
  
  if(qString && qString.length) {
    newValue = baseURL + '/select?q=' + qString;
  }
  else {
    newValue = baseURL + '/select';
  }
  
  $('#url-value')[0].value = newValue;
}

function getQueryStringFromWindowHash() {
  
  var hash = window.location.hash;
  
  if(hash && hash.length && hash.match(/^\#/)) {
    hash = hash.replace(/^\#/, '');
    
    if(hash.length) {
      
      // unescape incase e.g. spaces are %20
      hash = unescape(hash);
      
      // set our "QueryString"
      setQueryURL(hash);
      
      // parse the QueryString out to populate fields, logic etc
      parseEditedQueryString();
      
      // do search
      doSearch();
    }
  }
}

// parse user-edited QueryString into field data
function parseEditedQueryString(noRedraw) {
  
  // get new value, remove base URL bits
  var newValue = $('#url-value').prop('value').replace(baseURL, '').replace(/\/select(\?q\=)?/, '');
  
  // split on groups
  var groups = $.grep(newValue.split(/[()]/), function(a) { return a.length > 0; });
  var outerLogic = 'AND';
  var groupID = 0;
  
  // reset everything
  logicGroups = [];
  
  for(var field in fieldInfo) {
    $('[name=check_' + field + ']').prop('checked', false)
    fieldInfo[field].logicGroup = undefined;
  }  
  
  for(var i=0; i<groups.length; i++) {
    var group = groups[i];
    
    // outer logic
    if(group.match(/^ (AND|OR|NOT) $/)) {
      if(group.match(/AND/)) {
        outerLogic = 'AND';
      }
      else if(group.match(/OR/)) {
        outerLogic = 'OR';
      }
      else if(group.match(/NOT/)) {
        outerLogic = 'NOT';
      }
    }
    
    // group
    else {
      var innerLogic = 'AND';
      
      var split;
      
      // inner logic
      if(group.match(/ (AND|OR|NOT) /)) {
        if(group.match(/AND/)) {
          innerLogic = 'AND';
        }
        else if(group.match(/OR/)) {
          innerLogic = 'OR';
        }
        else if(group.match(/NOT/)) {
          innerLogic = 'NOT';
        }
        
        split = $.grep(group.split(/ (AND|OR|NOT) /), function(a) { return !a.match(/(AND|OR|NOT)/); })
      }
      else {
        split = [group];
      }
      
      var fields = [];
      
      for(var j=0; j<split.length; j++) {
        var tmp = split[j].split(':');
        var field = tmp[0];
        var value = tmp[1];
        
        // make sure field exists
        if(fieldInfo.hasOwnProperty(field)) {
          
          // add to fields list for logicGroups
          fields.push(field);
          
          // update value in HTML form field
          $('input#' + field)[0].value = value;
          queryParams[field] = value;
          
          // update logic group in fieldInfo
          fieldInfo[field].logicGroup = groupID;
          
          // change checked status
          $('[name=check_' + field + ']').prop('checked', 'checked');
          
          //console.log("Changing " + field + " to " + value);
        }
      }
      
      // add logic group
      logicGroups.push({
        innerLogic: innerLogic,
        outerLogic: outerLogic,
        id: groupID++,
        fields: fields
      });
    }
  }
  
  renderAllLogicGroups(noRedraw);
}

function renderAllLogicGroups(noRedraw) {
  
  if(!noRedraw) var logic = $('.logic-groups-container').empty();
  
  // set firstGroup to undefined
  globalStore.firstGroup = undefined;
  
  var totalFieldsAdded = 0;
  
  for(var i=0; i<logicGroups.length; i++) {
    var group = logicGroups[i];
    if(!group.fields.length) continue;
    
    var listItems = '';
    var fieldsAdded = 0;
    
    for(var j=0; j<group.fields.length; j++) {
      var key = group.fields[j];
      
      // check if it's checked
      if($('[name=check_' + key + ']').prop('checked') && queryParams[key] && queryParams[key].length) {
        if(!noRedraw) 
          listItems = listItems + '<li id="draggable-' + key + '" title="' + fieldInfo[key].label + '"> ' +
            '<img src="img/move_icon.jpg" style="height:12px;" /> ' +
            '<b>' + key + '</b>:' + queryParams[key] +
          '</li>';
        
        fieldsAdded++;
      }
    }
    
    if(fieldsAdded) {
      if(typeof(globalStore.firstGroup) === 'undefined') globalStore.firstGroup = group.id;
      
      if(!noRedraw) renderLogicGroup(group);
      
      var list = $('#logic-group-list' + group.id);
      list.append(listItems);
      if(!noRedraw) list.sortable().disableSelection();
      if(fieldsAdded > 1) $('#logic-group' + group.id).find('.inner-logic').removeClass('hidden');
    }
    
    totalFieldsAdded = totalFieldsAdded + fieldsAdded;
  }
  
  // show button to add logic group if we have more than 1 field
  if(totalFieldsAdded > 1) $('.add-logic-group').removeClass('hidden');
  
  // connect lists    
  if(!noRedraw) $('.logic-group-list').sortable( "option", "connectWith", ".logic-group-list");
}

// renders a logic group
function renderLogicGroup(group) {
  var container = $('.logic-groups-container');
  
  // render connector
  if(globalStore.firstGroup != group.id) {
    container.
      append('<div class="logic-connector">').
      append('<span class="outer-logic">' + 
        '<input type="radio" value="AND" name="outer_' + group.id + '" id="outer1_' + group.id + '" ' + (group.outerLogic === 'AND' ? 'checked="checked"' : '') +' /><label for="outer1_' + group.id + '">AND</label>' +
        '<input type="radio" value="OR" name="outer_' + group.id + '" id="outer2_' + group.id + '" ' + (group.outerLogic === 'OR' ? 'checked="checked"' : '') +' /><label for="outer2_' + group.id + '">OR</label>' +
        '<input type="radio" value="NOT" name="outer_' + group.id + '" id="outer3_' + group.id + '" ' + (group.outerLogic === 'NOT' ? 'checked="checked"' : '') +' /><label for="outer3_' + group.id + '">NOT</label>'
      ).append('<div class="logic-connector">');
    
    // outer-logic handler
    $('[name="outer_' + group.id + '"]').on('change', function() {
      var id = this.name.replace('outer_', '');
      logicGroups[id].outerLogic = this.value;
      updateQueryString(true);
      
      //doSearch();
    })
  }
  
  // render group
  container.append(
    '<div class="logic-group ' + group.innerLogic + '" id="logic-group' + group.id + '">' +
    '<div>' +
      '<span class="logic-group-header">Group ' + (group.id + 1) + '</span>' +
      '<span class="inner-logic hidden">' +
        '<input type="radio" value="AND" name="inner_' + group.id + '" id="inner1_' + group.id + '" ' + (group.innerLogic === 'AND' ? 'checked="checked"' : '') +' /><label for="inner1_' + group.id + '">AND</label>' +
        '<input type="radio" value="OR" name="inner_' + group.id + '" id="inner2_' + group.id + '" ' + (group.innerLogic === 'OR' ? 'checked="checked"' : '') +' /><label for="inner2_' + group.id + '">OR</label>' +
        '<input type="radio" value="NOT" name="inner_' + group.id + '" id="inner3_' + group.id + '" ' + (group.innerLogic === 'NOT' ? 'checked="checked"' : '') +' /><label for="inner3_' + group.id + '">NOT</label>' +
      '</span>' +
    '</div>' +
    '<ul class="logic-group-list" id="logic-group-list' + group.id + '">'
  );
  
  // inner-logic handler
  $('[name="inner_' + group.id + '"]').on('change', function() {
    var id = this.name.replace('inner_', '');
    $('#logic-group' + id).removeClass(logicGroups[id].innerLogic);
    
    logicGroups[id].innerLogic = this.value;
    $('#logic-group' + id).addClass(this.value);
    
    updateQueryString(true);
    
    //doSearch();
  })
  
  // make sortable list
  $('#logic-group-list' + group.id).sortable({
    
    // receive handler for when a field is dropped on a group
    receive: function(event, ui) {
      var item = ui.item;
      var sender = ui.sender;
      
      // get IDs and keys
      var key = item.prop("id").replace('draggable-', '');
      var oldGroupId = sender.prop("id").replace('logic-group-list', '');
      var newGroupId = this.id.replace('logic-group-list', '');
      
      // remove from old group
      var tmp = [];
      for(var i=0; i<logicGroups[oldGroupId].fields.length; i++) {
        if(key != logicGroups[oldGroupId].fields[i]) tmp.push(logicGroups[oldGroupId].fields[i]);
      }
      logicGroups[oldGroupId].fields = tmp;
      
      // add to new group
      logicGroups[newGroupId].fields.push(key);
      fieldInfo[key].logicGroup = newGroupId;
      
      updateQueryString();
      
      //doSearch();
    }
  }).disableSelection();
  
  // enable buttons
  $('.outer-logic').buttonset();
  $('.inner-logic').buttonset();
  
  // connect lists
  $('.logic-group-list').sortable( "option", "connectWith", ".logic-group-list");
}

// renders results panel
function renderResults(text) {
  $('.results').empty();
  
  // create tabs
  $('.results').append('<div id="results-accordion">');
  
  $('#results-accordion').append('<h3>Count</h3><div class="count">');
  $('#results-accordion').append('<h3 id="formatted-label">Table</h3><div class="formatted" style="font-size:12px">');
  $('#results-accordion').append('<h3>Raw</h3><div class="raw" style="max-height:300px; scroll: auto">');
  $('#results-accordion').append('<h3>Download</h3><div class="download">');
  
  var json = JSON.parse(text);
  var numFound = json.response.numFound;
  $('.count').append('Found ' + numFound + ' results<div style="font-size:small; color: grey; float:right;clear: both">Query time: ' + (json.responseHeader.QTime / 1000) + 's');
  $('.raw').append('<pre class="syntax language-json" style="margin:0"><code style="font-size: 10px;">' + text + '</code></pre>');
 
  // download section
  $('.download').append('Download ' + numFound + ' results as: ');
  
  var types = ['XML', 'JSON', 'CSV'];
  for(var i=0; i<types.length; i++) {
    var type = types[i];
    var lctype = type.toLowerCase();
    
    $('.download').append('<a target="_blank" href="#" class="button download-' + lctype + '">' + type + ' </a>');
    $('.download-' + lctype).button({ disabled: numFound ? false : true}).on('mouseover', {type: lctype}, updateDownloadURL);
  }
  
  $('.download').append('<div style="margin-top:10px; float: right; color: grey;"><small>*Right-click and select "Save As" to save to your computer</small></div>');
  
  // URL to get back to the page
  $('.download').append(
    '<div style="clear:both">URL for this query: <input readonly="readonly" id="exturl" class="url-value" type="text" value="' +
    window.location.href.replace(/\#.*/g, '') + '#' +
    $('#url-value')[0].value.replace(baseURL, '').replace('/select?q=', '') + '"></div>'
  );
  $('#exturl').click(function() { $(this).select(); });
  
  // start table
  if(numFound) {
    renderTable();
  }
  else {
    $('.formatted').append('No data');
  }
  
  $('#results-accordion').accordion({
    collapsible: true,
    heightStyle: "content",
    beforeActivate: function(event, ui) {
      var table = $.fn.dataTable.fnTables();
      if ( table.length > 0 ) {
        $(table).dataTable().fnAdjustColumnSizing();
      }
    }
  });
}

function renderTable() {  
  $('.formatted').append('<table id="formatted-table">');
  
  // add headers    
  var order = globalStore.order;
  
  // write actual th html
  var row = '';
  for(var i=0; i<order.length; i++) {
    var field = order[i];
    row = row + '<th title="' + fieldInfo[field].label + '" rel="' + field + '">' + fieldInfo[field].header + '</th>';
  }
  
  // render table
  var table = $('#formatted-table').append(
    '<thead><tr id="table-header">' + row + '</tr></thead>'
  ).append(
    '<tbody></tbody>'
  ).dataTable({
    
    // basic options
    sScrollX: "100%",
    bFilter: false,
    sPaginationType: "full_numbers",
    bStateSave: true,
    bScrollInfinite: true,
    bScrollCollapse: true,
    sScrollY: "210px",
    oLanguage: {
      sProcessing: '<img height="12px" src="img/ajax-loader.gif"/> Loading data'
    },
    
    // use jquery ThemeRoller style
    bJQueryUI: true,
    
    // enable column reordering, set up DOM
    sDom: 'R<"table-controls"<"right"r>i>t',
    
    // ajax data
    "bProcessing": true,
    "bServerSide": true,
    "sAjaxSource": $('#url-value').prop('value'),
    "fnServerData": function ( sSource, aoData, fnCallback ) {
      
      // we need to convert the parameters DataTables sends into
      // the parameters that Solr expects. We just need the start
      // row and the number of rows required
      var start;
      var length;
      
      // get start and length
      for(var i=0; i<aoData.length; i++) {
        if(aoData[i].name === "iDisplayStart") {
          start = aoData[i].value;
        }
        
        if(aoData[i].name === "iDisplayLength") {
          length = aoData[i].value;
        }
      }
      
      if(length < 0) length = 10;
      
      // create object to pass to $.getJSON
      var newaoData = ({
        wt: 'json',
        rows: length,
        start: start
      });
      
      $.getJSON( sSource, newaoData, function (json) {
        
        // now we need to convert what Solr sends back into the form
        // that DataTables expects, which is an object with a property
        // "aaData" containing the actual returned rows
        var rows = [];
        getColumnOrder();
        var order = globalStore.order;
        
        for(var i=0; i<json.response.docs.length; i++) {
          
          // reset row string
          var row = [];
          
          for(var j=0; j<order.length; j++) {
            var field = order[j];
            row.push(json.response.docs[i][field] ? unescape(json.response.docs[i][field]) : '-');
          }
          
          rows.push(row);
        }
        
        var numFound = json.response.numFound;
        
        var output = {
          "iTotalDisplayRecords": numFound,
          "iTotalRecords": numFound,
          "aaData": rows
        };
        
        // send data back to DataTables
        fnCallback(output);
      });
    },
    
    // when the columns are reordered we have to update the order in our vars
    oColReorder: {
      "fnReorderCallback": function () {
        getColumnOrder();
        
        var table = $.fn.dataTable.fnTables();
        if ( table.length > 0 ) {
          $(table).dataTable().fnAdjustColumnSizing();
        }
      }
    }
  });
  
  // set column vis
  for(var i=0; i<order.length; i++) {
    table.fnSetColumnVis(i, fieldInfo[order[i]].hidden ? false : true);
  }
  
  table.fnAdjustColumnSizing();
  
  // configure columns popup
  $('.formatted').append('<div style="margin-top: 1em;"><a style="float:right" href="#" class="button config-button">Configure columns</a></div>');
  $('.config-button').button().on('click', function(event) {
    event.preventDefault;
    configureColumns();
  });
}

function getColumnOrder() {
  var table = $('#formatted-table');
  var pos = 1;
  var order = [];
  var added = {};
  
  table.find('th').each(function() {
    // find the field from the rel
    var k = $(this).attr('rel');
    var field = fieldInfo[k];
    
    // update field's order from current pos
    field.order = pos;
    order.push(k);
    added[k] = true;
    pos++;
  });
  
  // don't want to lose hidden fields, add them to the end
  // can we do this better so the order is retained somehow????
  for(var i=0; i<globalStore.order.length; i++) {
    var field = globalStore.order[i];
    if(!added.hasOwnProperty(field)) { order.push(field); }
  }
  
  // update globalStore order
  globalStore.order = order;
  updateCookies();
}

function configureColumns() {
  
  // split fields into 3 columns
  var numCols = 3;
  $('body').append('<div id="dialog-config" title="Configure columns" style="font-size: 12px;">');
  $('#dialog-config').empty();
  for(var i=1; i<=numCols; i++) {
    $('#dialog-config').append('<div style="float:left; margin-right: 10px;" id="config-col' + i + '">');
  }
  
  var perCol = Math.floor(globalStore.order.length / numCols) + 1;
  var currentCol = 1;
  var counter = 0;
  
  var table = $('#formatted-table').dataTable();
  
  for(var i=0; i<globalStore.order.length; i++) {
    if(counter > perCol) {
      currentCol++;
      counter = 0;
    }
    counter++;
    
    var field = globalStore.order[i];
    $('#config-col' + currentCol).append(
      '<div><label><input type="checkbox" class="conf" name="' + i + '" id="conf-' + field + '"> ' +
      '<b>' + fieldInfo[field].header + '</b>: ' + (fieldInfo[field].label || field) + '</input></label>'
    );
  }
  
  // handler for when a field is clicked on/off
  $('input.conf').each(function() {
    
    // initialise based on fieldInfo
    var field = this.id.replace('conf-', '');
    if(!fieldInfo[field].hidden) $(this).prop('checked', 'checked');
    
  }).on('click', function() {
    
    var field = this.id.replace('conf-', '');
    var table = $('#formatted-table').dataTable();
    if($(this).prop('checked')) {
      fieldInfo[field].hidden = false;
      table.fnSetColumnVis(this.name, true, false);
    }
    else {
      fieldInfo[field].hidden = true;
      table.fnSetColumnVis(this.name, false, false);
    }
    
    table.fnAdjustColumnSizing();
    updateCookies();
  });
  
  // render dialog
  $('#dialog-config').dialog({
    resizable: true,
    modal: true,
    width: '80%',
    buttons: {
      "All": function() {
        $('input.conf').each(function() {
          var field = this.id.replace('conf-', '');
          fieldInfo[field].hidden = false;
          $(this).prop('checked', 'checked');
          table.fnSetColumnVis(this.name, true);
        });
        
        table.fnAdjustColumnSizing();
        updateCookies();
      },
      "None": function() {
        $('input.conf').each(function() {
          var field = this.id.replace('conf-', '');
          fieldInfo[field].hidden = true;
          $(this).prop('checked', false);
          table.fnSetColumnVis(this.name, false);
        });
        
        table.fnAdjustColumnSizing();
        updateCookies();
      },
      "OK": function() {
        $(this).dialog("close");
        table.fnDraw();
      }
    }
  });
}

function updateDownloadURL(event) {
  var type = event.data.type;
  
  var fields = [];
  for(var i=0; i<globalStore.order.length; i++) {
    var field = globalStore.order[i];
    if(!fieldInfo[field].hidden) { fields.push(field); }
  }
  
  $('.download-' + type).attr('href', $('#url-value').prop("value") + '&wt=' + type + '&rows=999999999&fl=' + fields.toString());
}

function updateShow() {
  var to = globalStore.tableStart + globalStore.tableRows;
  if(to > globalStore.numFound) to = globalStore.numFound;
  
  $('#show-from').text(globalStore.tableStart + 1);
  $('#show-to').empty().text(String(to).replace(/^0/, ''));
  $('#show-of').text(globalStore.numFound);
}

function paginateTable(start, rows) {
  var url = $('#url-value').prop('value');
  var table = $('#formatted-table').dataTable();
  
  table.fnClearTable();
  $('#table-loader').empty().append('<img src="img/ajax-loader.gif"/>');
  
  $.ajax({
    url: url,
    type: 'GET',
    dataType: 'json',
    
    data: {
      wt: 'json',
      indent: true,
      start: start,
      rows: rows
    },
    
    success: function( json ) {
      var table = $('#formatted-table').dataTable();
      
      table.fnClearTable();
      
      var numFound = json.response.numFound;
      
      if(numFound) {
        var order = globalStore.order;
        var rows = [];
        
        // add data
        for(var i=0; i<json.response.docs.length; i++) {
          
          // reset row string
          var row = [];
          
          for(var j=0; j<order.length; j++) {
            var field = order[j];
            row.push(json.response.docs[i][field] ? unescape(json.response.docs[i][field]) : '-');
          }
          
          rows.push(row);
        }
        
        table.fnAddData(rows);
        table.fnDraw();  
        table.fnAdjustColumnSizing();
        $('#table-loader').empty();
      }
    },
    
    error: function(xhr, status) {
      $('.results').empty().append('Search failed: ' + xhr.statusText);
    }
  });
}

// this function updates cookies that store field order and hidden state
function updateCookies() {
  var order = globalStore.order;
  var hidden = {};
  
  for(var k in fieldInfo) {
    if(fieldInfo[k].hidden) { hidden[k] = true; }
  }
  
  eraseCookie('order');
  eraseCookie('hidden');
  
  createCookie('order', JSON.stringify(order), (10 * 365));
  createCookie('hidden', JSON.stringify(hidden), (10 * 365));
}

function createCookie(name, value, days) {
  var expires;

  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toGMTString();
  } else {
    expires = "";
  }
  document.cookie = escape(name) + "=" + escape(value) + expires + "; path=/";
}

function readCookie(name) {
  var nameEQ = escape(name) + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return unescape(c.substring(nameEQ.length, c.length));
  }
  return null;
}

function eraseCookie(name) {
  createCookie(name, "", -1);
}