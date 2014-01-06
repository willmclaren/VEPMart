// global store variable
var globalStore = {
  
  // configure me!
  baseURL: '/solr/vep',
  configURL: 'config.xml',
  
  // leave these
  filters: {},
  logicGroups: [],
  fieldInfo: {},
  groups: [],
  lastFieldID: 0
};

$(document).ready(function() {
  
  // initialise QueryString
  updateQueryString();
  
  // parse configuration from XML
  parseConfig(globalStore.configURL);
  
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
            
            globalStore.fieldInfo[name] = {
              group: group.name,
              sub: sub,
              
              label: $(this).attr('label'),
              header: $(this).attr('header'),
              range: range,
              order: order++
            };
            
            if(hidden.hasOwnProperty(name)) {
              globalStore.fieldInfo[name].hidden = true;
            }
          })
        })
        
        globalStore.groups.push(group);
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
        for(var k in globalStore.fieldInfo) fields.push(k);
        fields = fields.sort(function(a,b) { return (globalStore.fieldInfo[a].order || 999) - (globalStore.fieldInfo[b].order || 999) });
        
        for(var i=0; i<globalStore.groups.length; i++) {
          var group = globalStore.groups[i];
          
          for(var j=0; j<globalStore.groups[i].subs.length; j++) {
            for(var k=0; k<fields.length; k++) {
              var field = fields[k];
              var thisSub = globalStore.fieldInfo[field].sub || 'Other';
              
              if(globalStore.fieldInfo[field].group === group.name && thisSub === globalStore.groups[i].subs[j]) {
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
    url: globalStore.baseURL + '/admin/luke',
    type: 'GET',
    dataType: 'json',
    
    data: {
      wt: 'json'
    },
    
    success: function( json ) {
      
      // add fields
      var fields = [];
      for(var k in json.fields) {
        if(!globalStore.fieldInfo[k]) continue;
        fields.push(k);
      }
      
      // sort fields using order from config
      fields = fields.sort(function(a,b) { return (globalStore.fieldInfo[a].order || 999) - (globalStore.fieldInfo[b].order || 999) });
      
      for(var k=0; k<fields.length; k++) {
        var key = fields[k];
        var field = json.fields[key];
        var type = field.type;
        if(!globalStore.fieldInfo[key]) continue;
        
        // store type and whether it's a multi index
        globalStore.fieldInfo[key].type = type;
        globalStore.fieldInfo[key].multi = field.schema.match(/M/) ? true : false;
      }
      
      // write footer
      createFooter(json);
      
      $('.search')
        .empty()
        .append('<div id="add-filters-container">')
        .append('<div id="current-slider" style="clear:both; display: none" title="Slide to set values">');
      
      $('#add-filters-container')
        .append('<div id="add-filters" class="add-filters"><label>Add filters:</label></div> ');
      
      $('#add-filters')
        .append('<span id="field-value" class="field-value">')
        .append('<a href="javascript:" id="add-button" class="button">Add</a>')
        .append('<a href="javascript:" id="edit-button" class="button">Update</a>');
      
      $('#field-value')
        .append('<select id="combobox">')
        .append('<input id="current-value" type="text" name="current-value" placeholder="Enter a value"></input> ');
      
      $('#combobox').append('<option value="">Select one...</option>');
      
      getColumnOrder();
      var order = globalStore.order;
      
      for(var i=0; i<order.length; i++) {
        var key = order[i];
        var field = json.fields[key];
        $('#combobox').append('<option value="' + key + '">' + globalStore.fieldInfo[key].label + '</option>');
      }
      
      $( "#combobox" ).combobox();
      
      $('#add-button').button().on('click', function(event) {
        event.preventDefault();
        
        var field = $('#combobox').prop('value');
        var value = $('#current-value').prop('value');
        addFilter(field, value);
      });
      
      $('#edit-button').button().on('click', function(event) {
        event.preventDefault();
        
        var field = $('#combobox').prop('value');
        var value = $('#current-value').prop('value');
        var id = globalStore.fieldID;
        
        editFilter(id, field, value);
      }).hide();
      
      // add logic editor
      $('.filters-container')
        .prepend('<div class="logic-container"><div class="logic-groups-container"><span style="color: grey; margin-left: 1em;">No fields selected yet</span></div></div>');
     
      $('.logic-container').append('<div class="add-logic-group hidden"><a href="#" class="button add-logic-button small-button">Add group</a>');
      $('.add-logic-button').button().on('click', function(event) {
        var group = {
          innerLogic: 'AND',
          outerLogic: 'AND',
          id: globalStore.logicGroups.length,
          filters: []
        };
        globalStore.logicGroups.push(group);
        
        renderLogicGroup(group);
      });
      
      $('#combo-input').on( "autocompleteselect", function( event, ui ) {;
        var key = $('#combobox').prop('value');
        
        if(key === undefined || !json.fields.hasOwnProperty(key)) return;
        
        var field = json.fields[key];
        var type = field.type;
        
        var valueInput = $('#current-value');
        
        if(valueInput.hasClass('ui-autocomplete-input')) {
          valueInput.autocomplete("destroy");
        }
        
        // create sliders for numerical fields
        createSlider(key);
        
        // autocomplete string fields
        if(type === 'string') {
          addAutoComplete(key);
        }
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
      
      getQueryStringFromWindowHash();
    },
    
    error: function(xhr, status ) {
      console.log("Failed to get fields");
    }
  });
}

function addFilter(field, value) {
  
  var filterID = ++globalStore.lastFieldID;
  
  var filter = {
    id: filterID,
    field: field,
    value: value,
    logicGroup: 0
  };
  
  globalStore.filters[filterID] = filter;
  
  if(!globalStore.logicGroups.length) {
    globalStore.logicGroups.push({
      innerLogic: 'AND',
      outerLogic: 'AND',
      id: 0,
      filters: []
    });
  }
  globalStore.logicGroups[0].filters.push(filter);
  
  updateQueryString();
  
  resetFilterInput();
  
  highlightSearch();
}

function editFilter(id, field, value) {
  var filter = globalStore.filters[id];
  
  filter.field = field;
  filter.value = value;
  updateQueryString();
  
  resetFilterInput();
  
  highlightSearch();
}

function resetFilterInput() {
  $('#combo-input').prop('value', '');
  $('#combobox').prop('selectedIndex',0);
  $('#current-value').prop('value', '');
  $('#current-slider').empty().hide();
  
  $('#edit-button').hide();
  $('#add-button').show();
}

function addAutoComplete(fieldName) {
  
  var input = $('#current-value');
  
  var source = [];
  
  $.ajax({
    url: globalStore.baseURL + '/admin/luke',
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
            if(globalStore.fieldInfo[fieldName].multi) {                
              $.ajax({
                url: globalStore.baseURL + '/select',
                type: 'GET',
                dataType: 'json',
                
                data: {
                  wt: 'json',
                  q: $('#combobox').val() + ":*" + this.value + "*",
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
                url: globalStore.baseURL + '/select',
                type: 'GET',
                dataType: 'json',
                
                data: {
                  wt: 'json',
                  q: $('#combobox').val() + ":*" + this.value + "*",
                  rows: 100,
                  group: true,
                  'group.field': $('#combobox').val()
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
      
      //else {
        input.autocomplete({
          source: source,
          minLength: 0
        });
      //}
    }
  });
}

// create jQueryUI slides for numeric fields
function createSlider(key) {
  
  var type = globalStore.fieldInfo[key].type;
  
  // sliders for fields with defined ranges
  if(globalStore.fieldInfo[key].range && globalStore.fieldInfo[key].range.length) {
    $('#current-slider').empty().append('<div class="slider-container" id="slider-container">').show();
    $('#slider-container').empty().append('<div class="slider" id="slide">');
    
    if(type === 'int') {
      $("#slide").slider({
        range: true,
        min: globalStore.fieldInfo[key].range[0],
        max: globalStore.fieldInfo[key].range[1],
        slide: function( event, ui ) {
          $('#current-value').val("[" + ui.values[0] + " TO " + ui.values[1] + "]");
        }
      });
    }
    else {
      $("#slide").slider({
        range: true,
        min: globalStore.fieldInfo[key].range[0] * 1000,
        max: globalStore.fieldInfo[key].range[1] * 1000,
        slide: function( event, ui ) {
          $('#current-value').val("[" + (ui.values[0] / 1000) + " TO " + (ui.values[1] / 1000) + "]");
        }
      });
    }
  }
  
  // create slider for int types
  else if(type === 'int') {
    
    // loading placeholder
    $('#current-slider').empty().append('<div class="slider-container" id="slider-container"><div class="loading"><img src="img/ajax-loader.gif"/> Getting field statistics</div>').show();
    
    // request min/max from stats
    $.ajax({
      url: globalStore.baseURL + '/select',
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
        globalStore.fieldInfo[this.key].range = [
          r.stats.stats_fields[this.key].min, 
          r.stats.stats_fields[this.key].max
        ];
        
        $('#slider-container').empty().append('<div rel="' + type + '" class="slider" id="slide">');
        $("#slide").slider({
          range: true,
          min: globalStore.fieldInfo[this.key].range[0],
          max: globalStore.fieldInfo[this.key].range[1],
          slide: function( event, ui ) {
            $('#current-value').val("[" + ui.values[0] + " TO " + ui.values[1] + "]");
          }
        });
      },
      
      error: function( xhr, status ) {
        console.log("Error");
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
    
    $(this).removeClass('highlight');
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
          
          window.location.hash = '';
          setQueryURL('');
          resetFilterInput();
          globalStore.filters = {};
          globalStore.logicGroups = [];
          
          updateQueryString();
          doSearch();
          $(this).dialog("close");
          
          $('.search-button').removeClass('highlight');
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

function highlightSearch() {
  $('.search-button').addClass('highlight');
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
  
  // update QueryString field
  setQueryURL(createQueryString());
  
  // render groups
  renderAllLogicGroups(noRedraw);
}

// creates query string from fields and logicGroups
function createQueryString() {
  var qString = '';
  
  for(var i=0; i<globalStore.logicGroups.length; i++) {
    var group = globalStore.logicGroups[i];
    if(!group.filters.length) continue;
    
    var qStringPart = '';
    
    for(var j=0; j<group.filters.length; j++) {
      var filter = group.filters[j];
      qStringPart = qStringPart + (qStringPart.length ? ' ' + group.innerLogic + ' ' : '') + filter.field + ':' + filter.value.replace(':', '\:');
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
    newValue = globalStore.baseURL + '/select?q=' + qString;
  }
  else {
    newValue = globalStore.baseURL + '/select';
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
  var newValue = $('#url-value').prop('value').replace(globalStore.baseURL, '').replace(/\/select(\?q\=)?/, '');
  
  // split on groups
  var groups = $.grep(newValue.split(/[()]/), function(a) { return a.length > 0; });
  var outerLogic = 'AND';
  var groupID = 0;
  
  // reset everything
  globalStore.logicGroups = [];
  globalStore.filters = {};
  
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
      
      var tmpfilters = [];
      
      for(var j=0; j<split.length; j++) {
        var tmp = split[j].split(':');
        var field = tmp[0];
        var value = tmp[1];
        
        // make sure field exists
        if(globalStore.fieldInfo.hasOwnProperty(field)) {
          var filterID = ++globalStore.lastFieldID;
          
          var filter = {
            id: filterID,
            field: field,
            value: value,
            logicGroup: groupID
          };
          
          // add to filters list for logicGroups
          tmpfilters.push(filter);
          globalStore.filters[filterID] = filter;
        }
      }
      
      // add logic group
      globalStore.logicGroups.push({
        innerLogic: innerLogic,
        outerLogic: outerLogic,
        id: groupID++,
        filters: tmpfilters
      });
    }
  }
  
  renderAllLogicGroups(noRedraw);
}

// renders results panel
function renderResults(text) {
  $('.results').empty();
  
  // create tabs
  $('.results').append('<div id="results-accordion">');
  
  $('#results-accordion').append('<h3 id="formatted-label">Results preview</h3><div class="formatted" style="font-size:12px">');
  $('#results-accordion').append('<h3>Download</h3><div class="download">');
  
  // parse JSON
  var json = JSON.parse(text);
 
  // download section
  var numFound = json.response.numFound;
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
    $('#url-value')[0].value.replace(globalStore.baseURL, '').replace('/select', '').replace('?q=', '') + '"></div>'
  );
  $('#exturl').click(function() { $(this).select(); });
  
  // start table
  if(numFound) {
    renderTable();
    
    // add query time
    $('.formatted').append('<div style="font-size:small; color: grey; clear: both; padding-top:1em;">Query time: ' + (json.responseHeader.QTime / 1000) + 's');
  }
  else {
    $('.formatted').append('Start searching to see results here!');
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
    row = row + '<th title="' + globalStore.fieldInfo[field].label + '" rel="' + field + '">' + globalStore.fieldInfo[field].header + '</th>';
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
    bSort: false,
    //sPaginationType: "full_numbers",
    //bStateSave: true,
    bScrollInfinite: true,
    bScrollCollapse: true,
    sScrollY: "210px",
    oLanguage: {
      sProcessing: '<img height="12px" src="img/ajax-loader.gif"/> Loading data'
    },
    
    // use jquery ThemeRoller style
    bJQueryUI: true,
    
    // enable column reordering, set up DOM
    sDom: 'Rt<"table-controls"<"right config-button-div"><"right"r>i>',
    
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
    table.fnSetColumnVis(i, globalStore.fieldInfo[order[i]].hidden ? false : true);
  }
  
  table.fnAdjustColumnSizing();
  
  // configure columns popup
  $('.config-button-div').append('<div><a style="float:right" class="button" id="config-button">Configure columns</a></div>');
  $('#config-button').button().on('click', function(event) {
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
    var field = globalStore.fieldInfo[k];
    
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
      '<b>' + globalStore.fieldInfo[field].header + '</b>: ' + (globalStore.fieldInfo[field].label || field) + '</input></label>'
    );
  }
  
  // handler for when a field is clicked on/off
  $('input.conf').each(function() {
    
    // initialise based on fieldInfo
    var field = this.id.replace('conf-', '');
    if(!globalStore.fieldInfo[field].hidden) $(this).prop('checked', 'checked');
    
  }).on('click', function() {
    
    var field = this.id.replace('conf-', '');
    var table = $('#formatted-table').dataTable();
    if($(this).prop('checked')) {
      globalStore.fieldInfo[field].hidden = false;
      table.fnSetColumnVis(this.name, true, false);
    }
    else {
      globalStore.fieldInfo[field].hidden = true;
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
          globalStore.fieldInfo[field].hidden = false;
          $(this).prop('checked', 'checked');
          table.fnSetColumnVis(this.name, true);
        });
        
        table.fnAdjustColumnSizing();
        updateCookies();
      },
      "None": function() {
        $('input.conf').each(function() {
          var field = this.id.replace('conf-', '');
          globalStore.fieldInfo[field].hidden = true;
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

function renderAllLogicGroups(noRedraw) {
  
  if(!noRedraw) var logic = $('.logic-groups-container').empty();
  
  // set firstGroup to undefined
  globalStore.firstGroup = undefined;
  
  var totalFiltersAdded = 0;
  
  for(var i=0; i<globalStore.logicGroups.length; i++) {
    var group = globalStore.logicGroups[i];
    if(!group.filters.length) continue;
    
    var listItems = '';
    var filtersAdded = 0;
    
    for(var j=0; j<group.filters.length; j++) {
      var filter = group.filters[j];
      
      if(!noRedraw) 
        listItems = listItems + '<li id="draggable-' + filter.id + '" title="' + globalStore.fieldInfo[filter.field].label + '"> ' +
          '<div><img src="img/move_icon.jpg" style="height:12px;" /> ' +
          '<b>' + filter.field + '</b>:' + filter.value + '</div>' +
          '<div style="clear:both;">&nbsp;<div style="float:right;">' +
            '<a href="javascript:" id="edit-filter-' + filter.id + '" title="Edit this filter">Edit</a>' +
            '<a style="display: none" href="javascript:" id="cancel-filter-' + filter.id + '" title="Cancel editing of this filter">Cancel edit</a> | ' +
            '<a href="javascript:" id="delete-filter-' + filter.id + '" title="Delete this filter">Delete</a>' +
          '</div></div>' +
        '</li>';
      
      filtersAdded++;
    }
    
    if(filtersAdded) {
      if(typeof(globalStore.firstGroup) === 'undefined') globalStore.firstGroup = group.id;
      
      if(!noRedraw) renderLogicGroup(group);
      
      var list = $('#logic-group-list' + group.id);
      list.append(listItems);
      if(!noRedraw) list.sortable().disableSelection();
      if(filtersAdded > 1) $('#logic-group' + group.id).find('.inner-logic').removeClass('hidden');
    }
    
    totalFiltersAdded = totalFiltersAdded + filtersAdded;
  }
  
  // show button to add logic group if we have more than 1 field
  if(totalFiltersAdded > 1) {
    $('.add-logic-group').removeClass('hidden');
  }
  
  //else if(totalFiltersAdded == 0) {
  //  $('.logic-groups-container').append('<span style="color: grey; margin-left: 1em;">No fields selected yet</span>');
  //}
  
  addFilterControls();
  
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
        '<input type="radio" value="AND" name="outer_' + group.id + '" id="outer1_' + group.id + '" ' + (group.outerLogic === 'AND' ? 'checked="checked"' : '') +' /><label for="outer1_' + group.id + '" class="small-button">AND</label>' +
        '<input type="radio" value="OR" name="outer_' + group.id + '" id="outer2_' + group.id + '" ' + (group.outerLogic === 'OR' ? 'checked="checked"' : '') +' /><label for="outer2_' + group.id + '" class="small-button">OR</label>' +
        '<input type="radio" value="NOT" name="outer_' + group.id + '" id="outer3_' + group.id + '" ' + (group.outerLogic === 'NOT' ? 'checked="checked"' : '') +' /><label for="outer3_' + group.id + '" class="small-button">NOT</label>'
      ).append('<div class="logic-connector">');
    
    // outer-logic handler
    $('[name="outer_' + group.id + '"]').on('change', function() {
      var id = this.name.replace('outer_', '');
      globalStore.logicGroups[id].outerLogic = this.value;
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
    $('#logic-group' + id).removeClass(globalStore.logicGroups[id].innerLogic);
    
    globalStore.logicGroups[id].innerLogic = this.value;
    $('#logic-group' + id).addClass(this.value);
    
    updateQueryString(true);
    
    //doSearch();
  })
  
  // make sortable list
  $('#logic-group-list' + group.id).sortable({
    
    // stop handler for when a filter is dropped
    stop: function(event, ui) {
      var item = ui.item;
      
      // iterate over logic groups
      item.parent().parent().parent().find('div.logic-group').each(function() {
        var groupDiv = $(this);
        var groupId = groupDiv.prop('id').replace('logic-group', '');
        
        var tmp = [];
        
        // get order of filters
        groupDiv.find('li').each(function() {
          var filterId = $(this).prop('id').replace('draggable-', '');
          var filter = globalStore.filters[filterId];
          filter.logicGroup = groupId;
          tmp.push(filter);
        });
        
        // add filters to logic group
        globalStore.logicGroups[groupId].filters = tmp;
      });
      
      updateQueryString();
    }
  }).disableSelection();
  
  // enable buttons
  $('.outer-logic').buttonset();
  $('.inner-logic').buttonset();
  
  // connect lists
  $('.logic-group-list').sortable( "option", "connectWith", ".logic-group-list");
}

// edit, cancel and delete buttons
function addFilterControls() {

  $("[id^=edit-filter-]").on('click', function(event) {
    event.preventDefault();
    
    var id = this.id.replace('edit-filter-', '');
    globalStore.fieldID = id;
    
    $("[id^=edit-filter-]").show();
    $("[id^=cancel-filter-]").hide();
    $(this).hide();
    $("#cancel-filter-" + id).show();
    
    var filter = globalStore.filters[id];
    
    $('#add-button').hide();
    $('#edit-button').show();
    
    $('#combobox').val(filter.field);
    $('#combo-input').val(globalStore.fieldInfo[filter.field].label);
    $('#current-value').val(filter.value);
    
    createSlider(filter.field);
    if(globalStore.fieldInfo[filter.field].type === 'string') {
      addAutoComplete(filter.field);
    }
    
    if(filter.value.match(/\[.+? TO .+?\]/)) {
      var values = filter.value.split(/(\[| TO |\])/);
      
      if(globalStore.fieldInfo[filter.field].type === 'int') {
        $("#slide").slider( "values", [values[2], values[4]] );
      }
      else {
        $("#slide").slider( "values", [values[2] * 1000, values[4] * 1000] );
      }
    }
  });
  
  $("[id^=cancel-filter-]").on('click', function(event) {
    event.preventDefault();
    
    resetFilterInput();
    $(this).hide();
    $("[id^=edit-filter-]").show();
  });
  
  $("[id^=delete-filter-]").on('click', function(event) {
    event.preventDefault();
    
    var id = this.id.replace('delete-filter-', '');
    
    $('body').append('<div id="delete-confirm" title="Delete this filter?"></div>');
    $('#delete-confirm').dialog({
      resizable: false,
      height: 140,
      modal: true,
      buttons: {
        "Delete": function() {
          
          // grab groupID before deleting
          var groupID = globalStore.filters[id].logicGroup;
          delete globalStore.filters[id];
          
          var gtmp = [];
          
          // remove it from logicGroups
          for(var i=0; i<globalStore.logicGroups[groupID].filters.length; i++) {
            if(globalStore.logicGroups[groupID].filters[i].id != id) {
              gtmp.push(globalStore.logicGroups[groupID].filters[i]);
            }
          }
          
          globalStore.logicGroups[groupID].filters = gtmp;
          
          resetFilterInput();
          
          // redraw
          updateQueryString();
          $(this).dialog("close");
          
          highlightSearch();
        },
        "Cancel": function() {
          $(this).dialog("close");
        }
      }
    });
  });
}

function updateDownloadURL(event) {
  var type = event.data.type;
  
  var fields = [];
  for(var i=0; i<globalStore.order.length; i++) {
    var field = globalStore.order[i];
    if(!globalStore.fieldInfo[field].hidden) { fields.push(field); }
  }
  
  $('.download-' + type).attr('href', $('#url-value').prop("value") + '&wt=' + type + '&rows=999999999&fl=' + fields.toString());
}

// this function updates cookies that store field order and hidden state
function updateCookies() {
  var order = globalStore.order;
  var hidden = {};
  
  for(var k in globalStore.fieldInfo) {
    if(globalStore.fieldInfo[k].hidden) { hidden[k] = true; }
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

// combobox code
(function( $ ) {
  $.widget( "custom.combobox", {
    _create: function() {
      this.wrapper = $( "<span>" )
        .addClass( "custom-combobox" )
        .insertAfter( this.element );

      this.element.hide();
      this._createAutocomplete();
      this._createShowAllButton();
    },

    _createAutocomplete: function() {
      var selected = this.element.children( ":selected" ),
        value = selected.val() ? selected.text() : "";

      this.input = $( '<input placeholder="Select a field" id="combo-input">' )
        .appendTo( this.wrapper )
        .val( value )
        .attr( "title", "" )
        //.addClass( "custom-combobox-input ui-widget ui-widget-content ui-state-default ui-corner-left" )
        .autocomplete({
          delay: 0,
          minLength: 0,
          source: $.proxy( this, "_source" )
        })
        .tooltip({
          tooltipClass: "ui-state-highlight"
        });

      this._on( this.input, {
        autocompleteselect: function( event, ui ) {
          ui.item.option.selected = true;
          this._trigger( "select", event, {
            item: ui.item.option
          });
        },

        autocompletechange: "_removeIfInvalid"
      });
    },

    _createShowAllButton: function() {
      var input = this.input,
        wasOpen = false;

      $( "<a>" )
        .attr( "tabIndex", -1 )
        .attr( "title", "Show All Items" )
        //.tooltip()
        .appendTo( this.wrapper )
        .button({
          icons: {
            primary: "ui-icon-triangle-1-s"
          },
          text: false
        })
        .removeClass( "ui-corner-all" )
        .addClass( "custom-combobox- ui-corner-right" )
        .mousedown(function() {
          wasOpen = input.autocomplete( "widget" ).is( ":visible" );
        })
        .click(function() {
          input.focus();

          // Close if already visible
          if ( wasOpen ) {
            return;
          }

          // Pass empty string as value to search for, displaying all results
          input.autocomplete( "search", "" );
        });
    },

    _source: function( request, response ) {
      var matcher = new RegExp( $.ui.autocomplete.escapeRegex(request.term), "i" );
      response( this.element.children( "option" ).map(function() {
        var text = $( this ).text();
        if ( this.value && ( !request.term || matcher.test(text) ) )
          return {
            label: text,
            value: text,
            option: this
          };
      }) );
    },

    _removeIfInvalid: function( event, ui ) {

      // Selected an item, nothing to do
      if ( ui.item ) {
        return;
      }

      // Search for a match (case-insensitive)
      var value = this.input.val(),
        valueLowerCase = value.toLowerCase(),
        valid = false;
      this.element.children( "option" ).each(function() {
        if ( $( this ).text().toLowerCase() === valueLowerCase ) {
          this.selected = valid = true;
          return false;
        }
      });

      // Found a match, nothing to do
      if ( valid ) {
        return;
      }

      // Remove invalid value
      this.input
        .val( "" )
        .attr( "title", value + " didn't match any item" )
        .tooltip( "open" );
      this.element.val( "" );
      this._delay(function() {
        this.input.tooltip( "close" ).attr( "title", "" );
      }, 2500 );
      this.input.data( "ui-autocomplete" ).term = "";
    },

    _destroy: function() {
      this.wrapper.remove();
      this.element.show();
    }
  });
})( jQuery );