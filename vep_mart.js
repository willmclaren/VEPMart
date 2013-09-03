// configure me!
var baseURL = '/solr/vep';
var configURL = 'config.xml';

// global variables
var queryParams = {};   // URL params
var globalStore = {};   // general misc global store, could maybe use window instead?
var logicGroups = [];   // logic groups for logic editor
var fieldInfo = {};     // field information
var groups = [];        // field groupings
var urlValue = baseURL;

$(document).ready(function() {
  // initialise URL
  updateURL();
  
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
            
            fieldInfo[$(this).attr('name')] = {
              group: group.name,
              sub: sub,
              
              label: $(this).attr('label'),
              header: $(this).attr('header'),
              range: range,
              order: order++
            };
          })
        })
        
        groups.push(group);
      })
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

function getFields() {
  $.ajax({
    url: baseURL + '/admin/luke',
    type: 'GET',
    dataType: 'json',
    
    data: {
      wt: 'json'
    },
    
    success: function( json ) {
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
          '<div class="field-container" id="' + key + '-container"><input class="check" type="checkbox" name="check_' + key + '">' +
          '<label class="field-label" for="' + key + '">' + (fieldInfo[key].label || key) + '</label>' +
          '<input id="' + key + '" type="text" name="' + key + '" ' + (type === 'string' ? 'class="ac field"' : 'class="field"') + '/>'
        );
        
        createSlider(type, key);
      }
      
      initFieldHandlers();
    },
    
    error: function(xhr, status ) {
      console.log("Failed to get fields");
    }
  });
}

// function to intialise handlers for user interaction with input fields
function initFieldHandlers() {
  
  // select on focus
  $('.field').on('focus', function() {
    var name = this.name;
    var check  = $('[name="check_' + name + '"]');
    check.prop('checked', true);
    
    var slider = $('#' + name + '-slider-container');
    check.prop('checked') ? slider.removeClass('hidden') : slider.addClass('hidden');
  });
  
  // toggle on click label
  $('.field-label').on('click', function() {
    var name = $(this).prop('for');
    var check  = $('[name="check_' + name + '"]');
    check.prop('checked') ? check.prop('checked', false) : check.prop('checked', true);
    
    var slider = $('#' + name + '-slider-container');
    check.prop('checked') ? slider.removeClass('hidden') : slider.addClass('hidden');
  });
  
  // update URL on change
  $('.field').on('keyup', function() {
    queryParams[this.name] = this.value;
    updateURL();
  }).on('blur', function() {
    queryParams[this.name] = this.value;
    updateURL();
  }).on('change', function() {
    queryParams[this.name] = this.value;
    updateURL();
  });
  
  // update URL on check on/off
  $('.check').on('change', function() {
    updateURL();
    
    var name = this.name.replace('check_', '');
    
    var slider = $('#' + name + '-slider-container');
    $(this).prop('checked') ? slider.removeClass('hidden') : slider.addClass('hidden');
  });
  
  // enable accordion
  $(function() {
    $( "#accordion" ).accordion({
      collapsible: true,
      heightStyle: "content"
    });
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
              source = [];
              
              if(fieldInfo[fieldName].multi) {
                var res = search(this.name + ":*" + this.value + "*");
                
                if(res) {
                  for(var i=0; i<res.response.docs.length; i++) {
                    source.push(unescape(res.response.docs[i][fieldName]));
                  }
                }
              }
              else {
                var res = groupSearch(this.name + ":*" + this.value + "*", this.name);
                
                if(res) {
                  for(var key in res.grouped) {
                    for(var i=0; i<res.grouped[key].groups.length; i++) {
                      source.push(unescape(res.grouped[key].groups[i].groupValue));
                    }
                  }
                }
              }
              
              this.rel = this.value;
            }
            
            input.autocomplete({
              source: source,
              minLength: 0
            });
          });
        }
        
        input.autocomplete({
          source: source,
          minLength: 0
        });
      }
    });
  });
}

// create jQueryUI slides for numeric fields
function createSlider(type, key) {
  
  // create slider for int types
  if(type === 'int') {
    $('#' + key + '-container').append('<div class="slider-container hidden" id="' + key + '-slider-container"><img src="ajax-loader.gif"/> <small>Loading stats</small>');
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
        $('#' + this.key + '-slider-container').empty().append('<div class="slider" id="slide_' + this.key + '">');
        $("#slide_" + this.key).slider({
          range: true,
          min: r.stats.stats_fields[this.key].min,
          max: r.stats.stats_fields[this.key].max,
          slide: function( event, ui ) {
            var f = this.id.replace('slide_', '');
            $('#' + f).val("[" + ui.values[0] + " TO " + ui.values[1] + "]");
            queryParams[f] = $('#' + f).val();
            updateURL();
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
        updateURL();
      }
    });
  }
}

function initButtons() {
  
  // search button
  $('.search-button').button().click(function(event) {
    event.preventDefault();
    doSearch();
  });
  
  // reset button
  $('.reset-button').button().click(function(event) {
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
          updateURL();
          getFields();
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

// group search is used by autocompletes
function groupSearch(q, groupField) {
  var result;
  
  $.ajax({
    url: baseURL + '/select',
    type: 'GET',
    dataType: 'json',
    async: false,
    
    data: {
      wt: 'json',
      q: q,
      rows: 100,
      group: true,
      'group.field': groupField 
    },
    
    success: function( r ) {
      result = r;
    },
    
    error: function( xhr, status ) {
      console.log("Error");
    }
  });
  
  return result;
}

// used by autocompletes for fields with multiple values (group doesn't work)
function search(q, params) {
  var result;
  
  $.ajax({
    url: baseURL + '/select',
    type: 'GET',
    dataType: 'json',
    async: false,
    
    data: {
      wt: 'json',
      q: q,
      rows: 100
    },
    
    success: function( r ) {
      result = r;
    },
    
    error: function( xhr, status ) {
      console.log("Error");
    }
  });
  
  return result;
}

// main search function
// passes on to renderResults
function doSearch() {
  $('.results').empty().append('<img src="ajax-loader.gif"/> Searching');
  
  var url = $('.url-value').prop('value');
  
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

// updates URL and logic diagram
function updateURL(noRedraw) {
  var newValue = urlValue + '/select';
  
  var qString = '';
  
  // init logicGroups
  if(!logicGroups.length) {
    var group = {
      innerLogic: 'AND',
      outerLogic: 'AND',
      id: 0,
      fields: []
    };
    
    logicGroups.push(group);
  }
  
  // drop fields into default logic group
  for(var key in queryParams) {
    if(typeof fieldInfo[key].logicGroup === 'undefined') {
      fieldInfo[key].logicGroup = 0;
      logicGroups[0].fields.push(key);
    }
  }
  
  if(!noRedraw) var logic = $('.logic-groups-container').empty();
  var totalFieldsAdded = 0;
  globalStore.firstGroup = undefined;
  
  for(var i=0; i<logicGroups.length; i++) {
    var group = logicGroups[i];
    if(!group.fields.length) continue;
    
    var listItems = '';
    var qStringPart = '';
    var fieldsAdded = 0;
    
    for(var j=0; j<group.fields.length; j++) {
      var key = group.fields[j];
      
      // check if it's checked
      if($('[name=check_' + key + ']').prop('checked') && queryParams[key].length) {
        qStringPart = qStringPart + (qStringPart.length ? ' ' + group.innerLogic + ' ' : '') + key + ':' + queryParams[key].replace(':', '\:');
        
        if(!noRedraw) 
          listItems = listItems + '<li id="draggable-' + key + '" title="' + fieldInfo[key].label + '"> ' +
            '<img src="move_icon.jpg" style="height:12px;" /> ' +
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
      
      qString = qString.length ? qString + ' ' + group.outerLogic + ' (' : '(';
      qString = qString + qStringPart;
      qString = qString + ')';
      
      if(fieldsAdded > 1) $('#logic-group' + group.id).find('.inner-logic').removeClass('hidden');
    }
    
    totalFieldsAdded = totalFieldsAdded + fieldsAdded;
  }
  
  // show button to add logic group if we have more than 1 field
  if(totalFieldsAdded > 1) $('.add-logic-group').removeClass('hidden');
  
  // connect lists    
  if(!noRedraw) $('.logic-group-list').sortable( "option", "connectWith", ".logic-group-list");
  
  // update URL field
  if(qString.length) newValue = urlValue + '/select?q=' + qString;
  $('.url-value').prop('value', newValue);
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
      updateURL(true);
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
    
    updateURL(true);
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
      
      updateURL();
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
  $('.count').append('Found ' + numFound + ' results');
  $('.raw').append('<pre class="syntax language-json" style="margin:0"><code style="font-size: 10px;">' + text + '</code></pre>');
 
  // download section
  $('.download').append('Download ' + numFound + ' results as: ');
  
  var types = ['XML', 'JSON', 'CSV'];
  for(var i=0; i<types.length; i++) {
    var type = types[i];
    var lctype = type.toLowerCase();
    $('.download').append('<a href="' + $('.url-value').prop("value") + '&wt=' + lctype + '&rows=999999999" class="button download-' + lctype + '">' + type + ' </a>');
    $('.download-' + lctype).button({ disabled: numFound ? false : true});
  }
  
  $('.download').append('<div style="margin-top:10px; float: right; color: grey;"><small>*Right-click and select "Save As" to save to your computer</small></div>');
  
  // start table
  if(numFound) {
    $('.formatted').append('<table id="formatted-table">');
    
    // add headers
    var fields = [];
    for(var k in fieldInfo) fields.push(k);
    fields = fields.sort(function(a,b) { return (fieldInfo[a].order || 999) - (fieldInfo[b].order || 999) });
    
    var row = '';
    var order = [];
    for(var i=0; i<groups.length; i++) {
      var group = groups[i];
      
      for(var k=0; k<groups[i].subs.length; k++) {
        for(var j=0; j<fields.length; j++) {
          var field = fields[j];
          var thisSub = fieldInfo[field].sub || 'Other';
          
          if(fieldInfo[field].group === group.name && thisSub === groups[i].subs[k]) {
            row = row + '<th title="' + fieldInfo[field].label + '">' + fieldInfo[field].header + '</th>';
            order.push(field);
          }
        }
      }
    }
    
    // store order
    globalStore.order = order;
    
    // render table
    var table = $('#formatted-table').append(
      '<thead><tr id="table-header">' + row + '</tr></thead>'
    ).append(
      '<tbody></tbody>'
    ).dataTable({
      sScrollX: "100%",
      bPaginate: false,
      bFilter: false
    });
    
    $('th').tooltip();
    
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
    
    $('.dataTables_info').addClass('hidden');
    
    // buttons
    $('.formatted').prepend(
      '<div class="table-controls">Showing results <span id="show-from">0</span> to <span id="show-to">0</span> of <span id="show-of">0</span>' +
      '<span style="float:right">' +
        '<a href="#" class="table-first noclick">First</a> | ' +
        '<a href="#" class="table-prev noclick">Prev</a> | ' +
        '<a href="#" class="table-next">Next</a> | ' + 
        '<a href="#" class="table-last">Last</a>' + 
      '</span>' +
      '<span id="table-rows-container" style="float:right; margin-right: 10px;">' +
        'Show <select id="table-rows">' +
          '<option value="10" selected="selected">10</option>' +
          '<option value="25">25</option>' +
          '<option value="50">50</option>' +
        '</select> results | ' +
      '</span>' +
      '<span id="table-loader" style="float:right; margin-right: 10px;"></span>'
    );
    
    $('#table-rows').on('change', function() {
      globalStore.tableRows = parseInt($(this).val());
      paginateTable(globalStore.tableStart, globalStore.tableRows);
      updateShow();
    });
    
    globalStore.tableStart = 0;
    globalStore.tableRows = 10;
    globalStore.numFound = numFound;
    
    if(numFound) {
      $('.table-next').removeClass('noclick');
      $('.table-last').removeClass('noclick');
      $('#table-rows').prop('disabled', false);
    }
    else {
      $('.table-next').addClass('noclick');
      $('.table-last').addClass('noclick');
      $('#table-rows').prop('disabled', 'disabled');
      globalStore.tableRows = 0;
    }
    
    updateShow();
    
    // first
    $('.table-first').on('click', function() {
      globalStore.tableStart = 0;
      $(this).addClass('noclick');
      $('.table-prev').addClass('noclick');
      $('.table-next').removeClass('noclick');
      $('.table-last').removeClass('noclick');
      
      paginateTable(globalStore.tableStart, globalStore.tableRows);
      updateShow();
    });
    
    // prev
    $('.table-prev').on('click', function() {
      globalStore.tableStart = globalStore.tableStart - globalStore.tableRows;
      if(globalStore.tableStart <= 0) {
        globalStore.tableStart = 0;
        $(this).addClass('noclick');
      }
      $('.table-next').removeClass('noclick');
      $('.table-last').removeClass('noclick');
      paginateTable(globalStore.tableStart, globalStore.tableRows);
      
      updateShow();
    });
    
    // next
    $('.table-next').on('click', function() {
      globalStore.tableStart = globalStore.tableStart + globalStore.tableRows;
      paginateTable(globalStore.tableStart, globalStore.tableRows);
      updateShow();
      $('.table-prev').removeClass('noclick');
      $('.table-first').removeClass('noclick');
    });
    
    // last
    $('.table-last').on('click', function() {
      globalStore.tableStart = Math.floor(globalStore.numFound / globalStore.tableRows) * globalStore.tableRows;
      paginateTable(globalStore.tableStart, globalStore.tableRows);
      updateShow();
      $('.table-next').addClass('noclick');
      $(this).addClass('noclick');
      $('.table-prev').removeClass('noclick');
      $('.table-first').removeClass('noclick');
    });
    
    // hack for table not rendering properly when initially hidden in accordion
    $('#formatted-label').on('click', function() { paginateTable(globalStore.tableStart, globalStore.tableRows)});
    
    // configure columns popup
    $('.formatted').append('<a style="float:right" href="#" class="button config-button">Configure columns</a>');
    $('.config-button').button().on('click', function(event) {
      event.preventDefault;
      
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
      
      for(var i=0; i<globalStore.order.length; i++) {
        if(counter > perCol) {
          currentCol++;
          counter = 0;
        }
        counter++;
        
        var field = order[i];
        $('#config-col' + currentCol).append(
          '<div><input type="checkbox" class="conf" name="' + i + '" id="conf-' + field + '"> ' +
          '<b>' + fieldInfo[field].header + '</b>: ' + (fieldInfo[field].label || field) + '</input>'
        );
      }
      
      // handler for when a field is clicked on/off
      $('input.conf').each(function() {
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
              table.fnSetColumnVis(this.name, true, false);
            });
          },
          "None": function() {
            $('input.conf').each(function() {
              var field = this.id.replace('conf-', '');
              fieldInfo[field].hidden = true;
              $(this).prop('checked', false);
              table.fnSetColumnVis(this.name, false, false);
            });
          },
          "OK": function() {
            $(this).dialog("close");
            table.fnDraw();
          }
        }
      });
    });
  }
  else {
    $('.formatted').append('No data');
  }
  
  $('#results-accordion').accordion({
    collapsible: true,
    heightStyle: "content"
  });
}

function updateShow() {
  var to = globalStore.tableStart + globalStore.tableRows;
  if(to > globalStore.numFound) to = globalStore.numFound;
  
  $('#show-from').text(globalStore.tableStart + 1);
  $('#show-to').empty().text(String(to).replace(/^0/, ''));
  $('#show-of').text(globalStore.numFound);
}

function paginateTable(start, rows) {
  var url = $('.url-value').prop('value');
  var table = $('#formatted-table').dataTable();
  
  table.fnClearTable();
  $('#table-loader').empty().append('<img src="ajax-loader.gif"/>');
  
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
        $('#table-loader').empty();
      }
    },
    
    error: function(xhr, status) {
      $('.results').empty().append('Search failed: ' + xhr.statusText);
    }
  });
}
