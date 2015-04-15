var mart = {
  // configure me!
  baseURL: 'http://bc-29-2-13.internal.sanger.ac.uk:9200/variation/vep',
	index: 'variation',
	type: 'vep',
  configURL: 'https://dl.dropboxusercontent.com/u/12936195/config.xml',
  summaryThreshold: 1000000,
  
  examples: [
    {
      queryString: '(gene_symbol:brca2)',
      label: 'BRCA2'
    },
    {
      queryString: '(sift_prediction:deleterious AND minor_allele_freq:[0.01 TO 0.5])',
      label: 'SIFT deleterious, common'
    }
  ],
  
  // leave these
  filters: {},
  logicGroups: [],
  fieldInfo: {},
  groups: [],
  lastFieldID: 0,
  order: [],
  summaries: {},
  
  // methods
  init: function() {
    // initialise QueryString
    var nullQuery = this.updateQueryString();
  
    // parse configuration from XML
    this.parseConfig(this.configURL);
    
    // get fields
    this.getFields();
  
    // do an initial blank search
    // if(nullQuery) this.doSearch(false);
  
    // init buttons
    this.initButtons();
    
    // create accordion
    $('.accordion').accordion({
      collapsible: true,
      heightStyle: "content",
      beforeActivate: function(event, ui) {
        var table = $.fn.dataTable.fnTables();
        if ( table.length > 0 ) {
          $(table).dataTable().fnAdjustColumnSizing();
        }
      }
    });
  },
  
  // parses XML config file
  parseConfig: function(url) {    
    $.ajax({
      url: url,
      type: 'GET',
      dataType: 'xml',
      async: false,
      // mart: this,
    
      success: function( xmlText ) {
      
        // convert to jQuery object
        var xml = $(xmlText);
        // var mart = this.mart;
      
        // get hidden states from cookie
        var hiddenCookie = mart.readCookie('hidden');
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
            
              mart.fieldInfo[name] = {
                group: group.name,
                sub: sub,
              
                label: $(this).attr('label'),
                header: $(this).attr('header'),
                range: range,
                order: order++
              };
            
              if(hidden.hasOwnProperty(name)) {
                mart.fieldInfo[name].hidden = true;
              }
            })
          })
        
          mart.groups.push(group);
        });
      
        // get colours
        xml.find('colours').find('field').each(function() {
          var field = $(this).attr('name');
          mart.fieldInfo[field].colours = {};
        
          $(this).find('colour').each(function() {
          
            var value = $(this).attr('value');
            var hex   = $(this).attr('hex');
          
            mart.fieldInfo[field].colours[value] = hex;
          });
        });
      
        // get summaries
        var summaryCookie = mart.readCookie('summaries');
        var summaryCookieData = {};
        if(summaryCookie) summaryCookieData = $.parseJSON(summaryCookie);
      
        console.log(summaryCookieData);
      
        xml.find('summaries').find('field').each(function() {
          var field = $(this).attr('name');
          var def   = $(this).attr('default');
        
          mart.summaries[field] = {
            default: def,
          };
        
          $(this).find('range').each(function() {
            if(!mart.summaries[field].hasOwnProperty('ranges')) {
              mart.summaries[field].ranges = [];
            }
          
            var from = $(this).attr('from');
            var to   = $(this).attr('to');
          
            mart.summaries[field].ranges.push({ from: from, to: to});
          });
        
          // copy in any missing data from cookie
          if(summaryCookieData.hasOwnProperty(field)) {
            for(i in summaryCookieData[field]) {
              if(!mart.summaries[field].hasOwnProperty(i)) mart.summaries[field][i] = summaryCookieData[field][i];
            }
          }
        });
       
      
        // get order from cookie
        var orderCookie = mart.readCookie('order');
        var order = [];
      
        if(orderCookie) {
          order = $.parseJSON(orderCookie);
        }
      
        // otherwise construct it from the order specified in config XML
        else {
          var fields = [];
          for(var k in mart.fieldInfo) fields.push(k);
          fields = fields.sort(function(a,b) { return (mart.fieldInfo[a].order || 999) - (mart.fieldInfo[b].order || 999) });
        
          for(var i=0; i<mart.groups.length; i++) {
            var group = mart.groups[i];
          
            for(var j=0; j<mart.groups[i].subs.length; j++) {
              for(var k=0; k<fields.length; k++) {
                var field = fields[k];
                var thisSub = mart.fieldInfo[field].sub || 'Other';
              
                if(mart.fieldInfo[field].group === group.name && thisSub === mart.groups[i].subs[j]) {
                  order.push(field);
                }
              }
            }
          }
        }
      
        // store order
        mart.order = order;
        mart.updateCookies();
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
  },

  createFooter: function (json) {
    var numDocs = json.index.numDocs;
    var numFields = Object.keys(json.fields).length;
    var updated = json.index.lastModified;
  
    $('.footer-stats').empty().append(
      '<b>Number of documents:</b> ' + numDocs + ' | ' +
      '<b>Number of fields:</b> ' + numFields + ' | ' +
      '<b>Last updated:</b> ' + updated
    );
  },

  getFields: function () {
    $.ajax({
      url: this.baseURL + '/_mapping',
      type: 'GET',
      dataType: 'json',
      mart: this,
    
      success: function( json ) {
      
  			var parseProperties = function(obj) {
  				var props = [];
								
  				for (var i in obj) {
  					if (!obj.hasOwnProperty(i)) continue;
					
  					if(obj[i].hasOwnProperty('properties')) {
  						var subProps = parseProperties(obj[i].properties);
						
  						for(var j=0; j<subProps.length; j++) {
  							props.push(subProps[j]);
  						}
  					}
  					if(obj[i].hasOwnProperty('type')) {
  						var type = obj[i].type;
  						props.push({ 'field': i, 'type': type, 'label': i, 'header': i});
  					}
  				}
				
  				return props;
  			};
			
        // add fields
        var fields = parseProperties(json[mart.index].mappings[mart.type].properties);
      
        // sort fields using order from config
        // fields = fields.sort(function(a,b) { return (mart.fieldInfo[a].order || 999) - (mart.fieldInfo[b].order || 999) });
      
        for(var k=0; k<fields.length; k++) {
          var field = fields[k];
          if(!mart.fieldInfo[key]) continue;
        
          // store type and whether it's a multi index
          mart.fieldInfo[field.field] = field;
				
          mart.order.push(field.field);
          // mart.fieldInfo[key].multi = field.schema.match(/M/) ? true : false;
        }
      
        // write footer
        // mart.createFooter(json);
      
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
      
        mart.getColumnOrder();
        var order = mart.order;
      
        for(var i=0; i<order.length; i++) {
          var key = order[i];
          var field = mart.fieldInfo[key];
          $('#combobox').append('<option value="' + key + '">' + mart.fieldInfo[key].label + '</option>');
        }
      
        $( "#combobox" ).combobox();
      
        $('#add-button').button().on('click', function(event) {
          event.preventDefault();
        
          var field = $('#combobox').prop('value');
          var value = $('#current-value').prop('value');
          mart.addFilter(field, value);
        });
      
        $('#edit-button').button().on('click', function(event) {
          event.preventDefault();
        
          var field = $('#combobox').prop('value');
          var value = $('#current-value').prop('value');
          var id = mart.fieldID;
        
          mart.editFilter(id, field, value);
        }).hide();
      
        // add logic editor
        $('.filters-container')
          .prepend('<div class="logic-container"><div class="logic-groups-container"><span style="color: grey; margin-left: 1em;">No filters added yet</span></div></div>');
     
        $('.logic-container').append('<div class="add-logic-group hidden"><a href="#" class="button add-logic-button small-button">Add group</a>');
        $('.add-logic-button').button().on('click', function(event) {
          var group = {
            innerLogic: 'AND',
            outerLogic: 'AND',
            id: mart.logicGroups.length,
            filters: []
          };
          mart.logicGroups.push(group);
        
          mart.renderLogicGroup(group);
        });
      
        $('#combo-input').on( "autocompleteselect", function( event, ui ) {;
          var key = $('#combobox').prop('value');
        
          if(key === undefined || !mart.fieldInfo.hasOwnProperty(key)) return;
        
          var field = mart.fieldInfo[key];
          var type = field.type;
        
          var valueInput = $('#current-value');
        
          if(valueInput.hasClass('ui-autocomplete-input')) {
            valueInput.autocomplete("destroy");
          }
        
          // create sliders for numerical fields
          mart.createSlider(key);
        
          // autocomplete string fields
          if(type === 'string' || type == undefined) {
            mart.addAutoComplete(key);
          }
        });
      
        $(window).bind('hashchange', mart.getQueryStringFromWindowHash());
      
        // update fields on QueryString change
        $('#url-value')
          .on('blur', function() {
          mart.parseEditedQueryString(false);
        })
          .on('keyup', function() {
          mart.parseEditedQueryString(true);
        });
      
        mart.getQueryStringFromWindowHash();
      },
    
      error: function(xhr, status ) {
        console.log("Failed to get fields");
      }
    });
  },

  addFilter: function (field, value) {
  
    var filterID = this.lastFieldID++;
  
    var filter = {
      id: filterID,
      field: field,
      value: value,
      logicGroup: 0
    };
  
    this.filters[filterID] = filter;
  
    if(!this.logicGroups.length) {
      this.logicGroups.push({
        innerLogic: 'AND',
        outerLogic: 'AND',
        id: 0,
        filters: []
      });
    }
    this.logicGroups[0].filters.push(filter);
  
    this.updateQueryString();
  
    this.resetFilterInput();
  
    if($('#auto_update').prop('checked')) {
      this.doSearch(true);
    }
    else {
      this.highlightSearch();
    }
  },

  editFilter: function (id, field, value) {
    var filter = this.filters[id];
  
    filter.field = field;
    filter.value = value;
    this.updateQueryString();
  
    this.resetFilterInput();
  
    if($('#auto_update').prop('checked')) {
      this.doSearch(true);
    }
    else {
      this.highlightSearch();
    }
  },

  resetFilterInput: function () {
    $('#combo-input').prop('value', '');
    $('#combobox').prop('selectedIndex',0);
    $('#current-value').prop('value', '');
    $('#current-slider').empty().hide();
  
    $('#edit-button').hide();
    $('#add-button').show();
  },

  addAutoComplete: function(fieldName) {
  
    var input = $('#current-value');
  
    var source = [];
  
    $.ajax({
      url: this.baseURL + '/_search',
      type: 'POST',
      dataType: 'json',
      processData: false,
    
      data: JSON.stringify({
        size: 0,
        aggs: {
          agg : {
            terms: { field: fieldName }
          }
        }
      }),
    
    
      success: function( fl ) {
        var distinct;
      
        for(var key in fl.aggregations.agg.buckets) {
          var field = fl.aggregations.agg.buckets[key];
          source.push(field.key);
        }
      
        input.autocomplete({
          source: source,
          minLength: 0
        });
      
        input.keyup(function() {
        
          if(this.value.length && this.value != this.rel) {
          
            this.rel = this.value;
            var key = $('#combobox').val();
          
            var inData = {
              size: 0,
              query: {
                match_phrase_prefix: {},
              },
              aggs: {
                agg : {
                  terms: { field: key }
                }
              }
            };
          
            inData.query.match_phrase_prefix[key] = this.value;
          
            $.ajax({

              url: mart.baseURL + '/_search',
              type: 'POST',
              dataType: 'json',
              processData: false,

              data: JSON.stringify(inData),
            
              success: function( res ) {
                source = [];
              
                for(var i=0; i<res.aggregations.agg.buckets.length; i++) {
                  source.push(unescape(res.aggregations.agg.buckets[i].key));
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
        });
      }
    });
  },

  // create jQueryUI slides for numeric fields
  createSlider: function(key) {
  
    var type = this.fieldInfo[key].type;
  
    // sliders for fields with defined ranges
    if(this.fieldInfo[key].range && this.fieldInfo[key].range.length) {
      $('#current-slider').empty().append('<div class="slider-container" id="slider-container">').show();
      $('#slider-container').empty().append('<div class="slider" id="slide">');
    
      if(this.fieldInfo[key].range[1] > 1) {
        $("#slide").slider({
          range: true,
          min: this.fieldInfo[key].range[0],
          max: this.fieldInfo[key].range[1],
          slide: function( event, ui ) {
            $('#current-value').val("[" + ui.values[0] + " TO " + ui.values[1] + "]");
          }
        });
      }
      else {
        $("#slide").slider({
          range: true,
          min: this.fieldInfo[key].range[0] * 1000,
          max: this.fieldInfo[key].range[1] * 1000,
          slide: function( event, ui ) {
            $('#current-value').val("[" + (ui.values[0] / 1000) + " TO " + (ui.values[1] / 1000) + "]");
          }
        });
      }
    }
  
    // create slider for int types
    else if(type === 'double' || type === 'float' || type === 'int') {
    
      // loading placeholder
      $('#current-slider').empty().append('<div class="slider-container" id="slider-container"><div class="loading"><img src="img/ajax-loader.gif"/> Getting field statistics</div>').show();
    
      // request min/max from stats
      $.ajax({
        url: this.baseURL + '/_search',
        type: 'POST',
        dataType: 'json',
        processData: false,
      
        data: JSON.stringify({
          size: 0,
          aggs: {
            "min" : {
              "min" : {
                "field" : key
              }
            },
            "max" : {
              "max" : {
                "field" : key
              }
            }
          }
        }),
      
        key: key,
      
        success: function( r ) {
          var min = r.aggregations.min.value;
          var max = r.aggregations.max.value
        
          mart.fieldInfo[this.key].range = [
            min, 
            max
          ];
        
          $('#slider-container').empty().append('<div rel="' + type + '" class="slider" id="slide">');
          // $("#slide").slider({
          //   range: true,
          //   min: mart.fieldInfo[this.key].range[0],
          //   max: mart.fieldInfo[this.key].range[1],
          //   slide: function( event, ui ) {
          //     $('#current-value').val("[" + ui.values[0] + " TO " + ui.values[1] + "]");
          //   }
          // });
        
          var type = mart.fieldInfo[key].type;
        
          if(max <= 1) {
            $("#slide").slider({
              range: true,
              min: mart.fieldInfo[key].range[0] * 1000,
              max: mart.fieldInfo[key].range[1] * 1000,
              slide: function( event, ui ) {
                $('#current-value').val("[" + (ui.values[0] / 1000) + " TO " + (ui.values[1] / 1000) + "]");
              }
            });
          }
          else {
            $("#slide").slider({
              range: true,
              min: mart.fieldInfo[key].range[0],
              max: mart.fieldInfo[key].range[1],
              slide: function( event, ui ) {
                $('#current-value').val("[" + ui.values[0] + " TO " + ui.values[1] + "]");
              }
            });
          }
        },
      
        error: function( xhr, status ) {
          console.log("Error");
        }
      });
    }
  },

  initButtons: function () {
  
    // search button
    $('.search-button').button({disabled: $('#auto_update').prop('checked')}).click(function(event) {
      event.preventDefault();
    
      mart.doSearch(true);
    
      $(this).removeClass('highlight');
    });
  
    // auto update
    $('#auto_update').change(function() {
      $('.search-button').button({disabled: $('#auto_update').prop('checked')});
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
            mart.setQueryURL('');
            mart.resetFilterInput();
            mart.filters = {};
            mart.logicGroups = [];
          
            mart.updateQueryString();
            mart.doSearch(true);
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
        searchContainerDiv.css('width', mart.searchWidth);
        resultsDiv.css('margin-left', mart.resultsMargin);
      
        $(this).empty().append('<span class="ui-button-text">&lt; Hide</span>');
      }
    
      // hide
      else {
        var currentWidth = searchContainerDiv.css('width');
        var currentMargin = resultsDiv.css('margin-left');
        resultsDiv.css('margin-left', '60px');
      
        searchDiv.addClass('hidden')
        searchContainerDiv.css('width', '');
      
        // use mart to remember initial sizes
        mart.searchWidth = currentWidth;
        mart.resultsMargin = currentMargin;
      
        $(this).empty().append('<span class="ui-button-text">&gt;</span>');
      }
    });
  },

  highlightSearch: function () {
    $('.search-button').addClass('highlight');
  },

  // updates QueryString and logic diagram
  updateQueryString: function (noRedraw) {
    
    var qString = this.createQueryString();
  
    // update QueryString field
    this.setQueryURL(qString);
  
    // render groups
    this.renderAllLogicGroups(noRedraw);
    
    return qString === '';
  },

  // creates query string from fields and logicGroups
  createQueryString: function () {
    var qString = '';
  
    for(var i=0; i<this.logicGroups.length; i++) {
      var group = this.logicGroups[i];
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
  },

  // set the Solr URL from a query string
  setQueryURL: function (qString) {
    var newValue;
  
    if(qString && qString.length) {
      newValue = this.baseURL + '/_search?q=' + qString;
    }
    else {
      newValue = this.baseURL + '/_search';
    }
  
    $('#url-value')[0].value = newValue;
  },

  getQueryStringFromWindowHash: function () {  
    var hash = window.location.hash;
  
    if(hash && hash.length && hash.match(/^\#/)) {
      hash = hash.replace(/^\#/, '');
    
      if(hash.length) {
      
        // unescape incase e.g. spaces are %20
        hash = unescape(hash);
      
        // set our "QueryString"
        this.setQueryURL(hash);
      
        // parse the QueryString out to populate fields, logic etc
        this.parseEditedQueryString();
      
        // do search
        this.doSearch();
      }
    }
  },

  // parse user-edited QueryString into field data
  parseEditedQueryString: function (noRedraw) {
  
    // get new value, remove base URL bits
    var newValue = $('#url-value').prop('value').replace(this.baseURL, '').replace(/\/\_search(\?q\=)?/, '');
  
    // split on groups
    var groups = $.grep(newValue.split(/[()]/), function(a) { return a.length > 0; });
    var outerLogic = 'AND';
    var groupID = 0;
  
    // reset everything
    this.logicGroups = [];
    this.filters = {};
  
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
          if(this.fieldInfo.hasOwnProperty(field)) {
            var filterID = ++this.lastFieldID;
          
            var filter = {
              id: filterID,
              field: field,
              value: value,
              logicGroup: groupID
            };
          
            // add to filters list for logicGroups
            tmpfilters.push(filter);
            this.filters[filterID] = filter;
          }
        }
      
        // add logic group
        this.logicGroups.push({
          innerLogic: innerLogic,
          outerLogic: outerLogic,
          id: groupID++,
          filters: tmpfilters
        });
      }
    }
  
    this.renderAllLogicGroups(noRedraw);
  },

  // main search function
  // passes on to updateSummary and updateResults
  doSearch: function(updateURL) {
    if(updateURL) window.location.hash = this.createQueryString();
  
    $('.search-spinner').show();
    $('.update-on-search').empty().append('<img src="img/ajax-loader.gif"/>');
    
    this.updateSummary();
    this.updateResults();
    
    $('.search-spinner').hide();
  },
  
  // updates the summary panel with counts and pie charts
  updateSummary: function() {
  
    var url = $('#url-value').prop('value');
    
    // do an initial query to get the count
    $.ajax({
      url: url,//this.baseURL + '/_search',
      type: 'POST',
      dataType: 'json',
      processData: false,
      mart: this,
    
      data: JSON.stringify({size: 0}),
    
      success: function( json ) {
    
        var numFound = json.hits.total;

        $('.summary')
          .empty()
          .append('<div style="margin-bottom: 10px"><b>Found ' + numberWithCommas(numFound) + ' results</b></div>');
        
        // trigger the download panel update method
        this.mart.updateDownload(json);
        
        // only render charts if count is less than threshold, otherwise takes too long
        if(numFound <= this.mart.summaryThreshold) {
          this.mart.renderSummary(true);
        }
        else {
          $('.summary')
          .append('<div>Summary charts displayed for ' + numberWithCommas(mart.summaryThreshold) + ' results or fewer; add more search filters to see charts (<a href="javascript:" class="force-summary">force</a>)</div>');
          
          // allow user to force charts to render
          $('.force-summary').click(function(event) {
            event.preventDefault();
            mart.renderSummary(true);
          })
        }
      },
    
      error: function(xhr, status) {
        $('.results').empty().append('Search failed: ' + xhr.statusText);
        
        $('.search-spinner').hide();
      }
    });
  },

  renderSummary: function (reloadAll) {
    
    if(reloadAll) $('.summary').empty().append('<img src="img/ajax-loader.gif"/>');
    $('.summary-spinner').show();
    
    var url = $('#url-value').prop('value');
  
    // construct the JSON structure
    // add each field to be aggregated
    var inData = {
      size: 0,
      aggs: {}
    };
    for(s in this.summaries) {
      var sum = this.summaries[s];
  
      if(!(sum.default || sum.show)) continue;
      
      // some fields can have pre-defined ranges
      if(sum.hasOwnProperty('ranges')) {
        inData.aggs[s] = {
          range: {
            field: s,
            ranges: sum.ranges
          }
        }
      }
      else {
        inData.aggs[s] = {
          terms: { field: s }
        };
      }
    }

    $.ajax({
      url: url,//globalStore.baseURL + '/_search',
      type: 'POST',
      dataType: 'json',
      processData: false,
  
      data: JSON.stringify(inData),
      
      // pass in local vars
      mart: this,
      reloadAll: reloadAll,
  
      success: function( json ) {
        var aggs = json.aggregations;
        var numFound = json.hits.total;
        var reloadAll = this.reloadAll;
        
        // redraw the whole div if reloadAll is true
        // this should only happen when search params change
        if(reloadAll) {
          $('.summary')
            .empty()
            .append('<div style="margin-bottom: 10px"><b>Found ' + numberWithCommas(numFound) + ' results</b></div>')
            .append('<div id="chart_switcher" class="piechart" style="background: lightgrey">')
            .append('<div class="chart-holder">')
            .append('<div class="summary-spinner"><img src="img/ajax-loader.gif"/>');
        }
        
        // iterate over possible aggregated fields
        for(i in mart.summaries) {
          
          $('.summary-spinner').hide();
          var fieldInfo = mart.fieldInfo[i];
          
          // work out if this field has aggregated data in the JSON result
          var hasData = aggs && aggs.hasOwnProperty(i) && aggs[i].buckets.length > 1;
          var show    = mart.summaries[i].hasOwnProperty('show') ? mart.summaries[i].show : mart.summaries[i].default;
          if(!show) show = false;
          
          // add checkbox for this field
          if(reloadAll) $('#chart_switcher').append('<div><label><input type="checkbox" class="chart_switcher" rel="' + i + '"' + (show && hasData ? ' checked' : '') + '>' + fieldInfo.header + '</label>');
          
          // don't try and draw a chart if there's no data
          if(!aggs || !aggs.hasOwnProperty(i)) continue;
  
          var data = [];
          var colours = [];
          var labels = [];
          var withData = {};
  
          for(var j in aggs[i].buckets) {
            var key   = aggs[i].buckets[j].key;
            var count = aggs[i].buckets[j].doc_count;
    
            if(count > 0) withData[key] = count;
            
            // add data to be passed to chart constructor
            data.push({
              label: key,
              value: count 
            });
    
            if(count > 0) labels.push(key);
            
            // add colour data
            if(
              fieldInfo.hasOwnProperty('colours') &&
              fieldInfo.colours.hasOwnProperty(key)
            ) colours.push(fieldInfo.colours[key]);
          }
  
          // for fields with forced ranges, we can still get buckets but no docs
          if(reloadAll && Object.keys(withData).length <= 1) {
            hasData = false;
            $('input[rel=' + i + ']').prop('checked', false);
          }
          
          var chartID = 'chart_' + i;
          
          // don't redraw the chart if it's already there
          if(!$('#' + chartID).length) {
            var chart = nv.models.pieChart()
              .donut(true)
              .x(function(d) { return d.label })
              .y(function(d) { return d.value })
              .showLabels(true)
              .labelThreshold(0.1)
              .showLegend(false)
              .valueFormat(d3.format(',i'));
  
            if(colours.length) chart.color(colours);
            
            // create div container for chart
            $('.chart-holder').append(
              '<div id="' + chartID + '" class="piechart">' +
              '<b>' + fieldInfo.label + '</b>' +
              '<svg style="height:180px;width:180px">' +
              (aggs[i].sum_other_doc_count ? '<div>Not shown: ' + aggs[i].sum_other_doc_count : '')
            );
            
            // hide this chart in the case where there is data but e.g. only one value
            if(!(show && hasData)) $('#chart_' + i).hide();
            
            // d3 call to draw the chart
            d3.select("#chart_" + i + " svg")
              .datum(data)
              .transition().duration(350)
              .call(chart);
  
            // add filter when a slice is clicked  
            var slices = d3.select("#chart_" + i + " svg").select('.nv-pie').selectAll('.nv-slice')[0];
  
            for(var s in slices) {
              var slice = slices[s];
              $(slice).prop("label", labels[s]);
              $(slice).prop("field", i);
    
              $(slice).click(function(e) {
                var label = this.label;
                if(label.match(/[\d\.]+\-[\d\.]+/)) {
                  label = '[' + label.replace('-', ' TO ') + ']';
                }
      
                mart.addFilter(this.field, label);
      
                // hide the tooltip
                $('.nvtooltip').hide();
              });
            }
          }
        }
        
        // add listener to checkboxes
        $('.chart_switcher').change(function(e) {
          var chartID = $(this).attr("rel");
      
          if(this.checked) {
            $('#chart_' + chartID).show();
            mart.summaries[chartID].show = true;
            if(!mart.summaries[chartID].default) mart.renderSummary(false);
          }
          else {
            $('#chart_' + chartID).hide();
            mart.summaries[chartID].show = false;
          }
  
          mart.updateCookies();
        });
      },
  
      error: function(xhr, status) {
        $('.results').empty().append('Search failed: ' + xhr.statusText);
      }
    });
  },
  
  // this method updates the panel containing the results table
  updateResults: function () {  
    $('.preview').empty().append('<table id="preview-table">');
    
    // var mart = this;
    
    // add headers    
    var order = this.order;
  
    // write actual th html
    var row = '';
    for(var i=0; i<order.length; i++) {
      var field = order[i];
      row = row + '<th title="' + mart.fieldInfo[field].label + '" rel="' + field + '">' + mart.fieldInfo[field].header + '</th>';
    }
  
    // render table
    var table = $('#preview-table').append(
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
      
      mart: mart,
    
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
          length: length,
          from: start
        });
      
        $.getJSON( sSource, newaoData, function (json) {
        
          // now we need to convert what Solr sends back into the form
          // that DataTables expects, which is an object with a property
          // "aaData" containing the actual returned rows
          var rows = [];
          mart.getColumnOrder();
          var order = mart.order;
        
          var parseResult = function(obj, prefix) {
            var res = {};
          
            for(var k in obj) {
              if(typeof obj[k] == 'object') {
                var subRes = parseResult(obj[k], (prefix.length ? prefix + '.' : '') + k + '.');
              
                for(var l in subRes) {
                  res[l] = subRes[l];
                }
              }
              else {
                res[prefix + k] = obj[k];
              }
            }
          
            return res;
          };
        
          for(var i=0; i<json.hits.hits.length; i++) {
            var res = parseResult(json.hits.hits[i]._source, '');
          
            // reset row string
            var row = [];
          
            for(var j=0; j<order.length; j++) {
              var field = order[j];
              row.push(res[field] ? unescape(res[field]) : '-');
            }
          
            rows.push(row);
          }
        
          var numFound = json.hits.total;
        
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
          mart.getColumnOrder();
        
          var table = $.fn.dataTable.fnTables();
          if ( table.length > 0 ) {
            $(table).dataTable().fnAdjustColumnSizing();
          }
        }
      }
    });
  
    // set column vis
    for(var i=0; i<order.length; i++) {
      table.fnSetColumnVis(i, mart.fieldInfo[order[i]].hidden ? false : true);
    }
  
    table.fnAdjustColumnSizing();
  
    // configure columns popup
    $('.config-button-div').append('<div><a style="float:right" class="button" id="config-button">Configure columns</a></div>');
    $('#config-button').button().on('click', function(event) {
      event.preventDefault;
      mart.configureColumns();
    });
  },
  
  // updates the download panel
  updateDownload: function (json) {
    
    var numFound = json.hits.total;
 
    // download section
    $('.download').empty().append('Download ' + numberWithCommas(numFound) + ' results as: ');
  
    var types = ['XML', 'JSON', 'CSV'];
    for(var i=0; i<types.length; i++) {
      var type = types[i];
      var lctype = type.toLowerCase();
    
      $('.download').append('<a target="_blank" href="#" class="button download-' + lctype + '">' + type + ' </a>');
      $('.download-' + lctype).button({ disabled: numFound ? false : true}).on('mouseover', {type: lctype}, this.updateDownloadURL);
    }
  
    $('.download').append('<div style="margin-top:10px; float: right; color: grey;"><small>*Right-click and select "Save As" to save to your computer</small></div>');
  
    // URL to get back to the page
    $('.download').append(
      '<div style="clear:both">URL for this query: <input readonly="readonly" id="exturl" class="url-value" type="text" value="' +
      window.location.href.replace(/\#.*/g, '') + '#' +
      $('#url-value')[0].value.replace(this.baseURL, '').replace('/_search', '').replace('?q=', '') + '"></div>'
    );
    $('#exturl').click(function() { $(this).select(); });
  },
  
  // reads the order of columns from the table
  getColumnOrder: function () {
    var table = $('#preview-table');
    var pos = 1;
    var order = [];
    var added = {};
    var mart = this;
  
    table.find('th').each(function() {
      // find the field from the rel
      var k = $(this).attr('rel');
      var field = mart.fieldInfo[k];
    
      // update field's order from current pos
      field.order = pos;
      order.push(k);
      added[k] = true;
      pos++;
    });
  
    // don't want to lose hidden fields, add them to the end
    // can we do this better so the order is retained somehow????
    for(var i=0; i<this.order.length; i++) {
      var field = this.order[i];
      if(!added.hasOwnProperty(field)) { order.push(field); }
    }
  
    // update mart order
    mart.order = order;
    mart.updateCookies();
  },

  configureColumns: function () {
  
    // split fields into 3 columns
    var numCols = 3;
    $('body').append('<div id="dialog-config" title="Configure columns" style="font-size: 12px;">');
    $('#dialog-config').empty();
    for(var i=1; i<=numCols; i++) {
      $('#dialog-config').append('<div style="float:left; margin-right: 10px;" id="config-col' + i + '">');
    }
  
    var perCol = Math.floor(this.order.length / numCols) + 1;
    var currentCol = 1;
    var counter = 0;
  
    var table = $('#preview-table').dataTable();
  
    for(var i=0; i<this.order.length; i++) {
      if(counter > perCol) {
        currentCol++;
        counter = 0;
      }
      counter++;
    
      var field = this.order[i];
      $('#config-col' + currentCol).append(
        '<div><label><input type="checkbox" class="conf" name="' + i + '" id="conf-' + field + '"> ' +
        '<b>' + this.fieldInfo[field].header + '</b>: ' + (this.fieldInfo[field].label || field) + '</input></label>'
      );
    }
  
    // handler for when a field is clicked on/off
    $('input.conf').each(function() {
    
      // initialise based on fieldInfo
      var field = this.id.replace('conf-', '');
      if(!mart.fieldInfo[field].hidden) $(this).prop('checked', 'checked');
    
    }).on('click', function() {
    
      var field = this.id.replace('conf-', '');
      if($(this).prop('checked')) {
        mart.fieldInfo[field].hidden = false;
        // table.fnSetColumnVis(this.name, true, false);
      }
      else {
        mart.fieldInfo[field].hidden = true;
        // table.fnSetColumnVis(this.name, false, false);
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
            mart.fieldInfo[field].hidden = false;
            $(this).prop('checked', 'checked');
            // table.fnSetColumnVis(this.name, true);
          });
        
          // table.fnAdjustColumnSizing();
          // updateCookies();
        },
        "None": function() {
          $('input.conf').each(function() {
            var field = this.id.replace('conf-', '');
            mart.fieldInfo[field].hidden = true;
            $(this).prop('checked', false);
            // table.fnSetColumnVis(this.name, false);
          });
        
          // table.fnAdjustColumnSizing();
          // updateCookies();
        },
        "OK": function() {
          $(this).dialog("close");
          
          var table = $('#preview-table').dataTable();
          
          for(var field in mart.fieldInfo) {
            table.fnSetColumnVis(mart.fieldInfo.order, !mart.fieldInfo[field].hidden);
          }
          
          table.fnAdjustColumnSizing();
          updateCookies();
          
          table.fnDraw();
        }
      }
    });
  },

  // examples  
  renderExamples: function () {

    if(this.hasOwnProperty('examples')) {
      var baseURL = 'vep_mart.html#';
      $('.logic-groups-container').append('<h3>Example queries</h3><div><ul class="examples">');
    
      for(var e in this.examples) {
        var example = this.examples[e];
        $('.examples').append('<li><a href="javascript:" rel="' + example.queryString + '" class="example-link">' + example.label + '</a></li>');
      }
      
      $('.example-link').on('click', function(event) {
        event.preventDefault();
        window.location.hash = this.rel;
        mart.getQueryStringFromWindowHash();
      });
    }
  },

  renderAllLogicGroups: function (noRedraw) {
  
    if(!noRedraw) var logic = $('.logic-groups-container').empty();
  
    // set firstGroup to undefined
    this.firstGroup = undefined;
  
    var totalFiltersAdded = 0;
  
    for(var i=0; i<this.logicGroups.length; i++) {
      var group = this.logicGroups[i];
      if(!group.filters.length) continue;
    
      var listItems = '';
      var filtersAdded = 0;
    
      for(var j=0; j<group.filters.length; j++) {
        var filter = group.filters[j];
      
        if(!noRedraw) 
          listItems = listItems + '<li id="draggable-' + filter.id + '" title="' + this.fieldInfo[filter.field].label + '"> ' +
            '<div><img src="img/move_icon.jpg" style="height:12px;" /> ' +
            '<b>' + filter.field + '</b>: ' + filter.value + '</div>' +
            '<div style="clear:both;">&nbsp;<div style="float:right;">' +
              '<a href="javascript:" id="edit-filter-' + filter.id + '" title="Edit this filter">Edit</a>' +
              '<a style="display: none" href="javascript:" id="cancel-filter-' + filter.id + '" title="Cancel editing of this filter">Cancel edit</a> | ' +
              '<a href="javascript:" id="delete-filter-' + filter.id + '" title="Delete this filter">Delete</a>' +
            '</div></div>' +
          '</li>';
      
        filtersAdded++;
      }
    
      if(filtersAdded) {
        if(typeof(this.firstGroup) === 'undefined') this.firstGroup = group.id;
      
        if(!noRedraw) this.renderLogicGroup(group);
      
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
  
    else if(totalFiltersAdded == 0) {
     $('.logic-groups-container').append('<span style="color: grey; margin-left: 1em;">No filters added yet</span>');
     $('.add-logic-group').addClass('hidden');
     
     mart.renderExamples();
    }
  
    this.addFilterControls();
  
    // connect lists    
    if(!noRedraw) $('.logic-group-list').sortable( "option", "connectWith", ".logic-group-list");
  },

  // renders a logic group
  renderLogicGroup: function (group) {
    var container = $('.logic-groups-container');
  
    // render connector
    if(this.firstGroup != group.id) {
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
        mart.logicGroups[id].outerLogic = this.value;
        mart.updateQueryString(true);
  
        if($('#auto_update').prop('checked')) {
          mart.doSearch(true);
        }
        else {
          mart.highlightSearch();
        }
      
        //doSearch(true);
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
      $('#logic-group' + id).removeClass(mart.logicGroups[id].innerLogic);
    
      mart.logicGroups[id].innerLogic = this.value;
      $('#logic-group' + id).addClass(this.value);
    
      mart.updateQueryString(true);
  
      if($('#auto_update').prop('checked')) {
        mart.doSearch(true);
      }
      else {
        mart.highlightSearch();
      }
    
      //doSearch(true);
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
            var filter = mart.filters[filterId];
            filter.logicGroup = groupId;
            tmp.push(filter);
          });
        
          // add filters to logic group
          mart.logicGroups[groupId].filters = tmp;
        });
      
        updateQueryString();
      
        if($('#auto_update').prop('checked')) {
          doSearch(true);
        }
        else {
          highlightSearch();
        }
      }
    }).disableSelection();
  
    // enable buttons
    $('.outer-logic').buttonset();
    $('.inner-logic').buttonset();
  
    // connect lists
    $('.logic-group-list').sortable( "option", "connectWith", ".logic-group-list");
  },

  // edit, cancel and delete buttons
  addFilterControls: function () {

    $("[id^=edit-filter-]").on('click', function(event) {
      event.preventDefault();
    
      var id = this.id.replace('edit-filter-', '');
      mart.fieldID = id;
    
      $("[id^=edit-filter-]").show();
      $("[id^=cancel-filter-]").hide();
      $(this).hide();
      $("#cancel-filter-" + id).show();
    
      var filter = mart.filters[id];
    
      $('#add-button').hide();
      $('#edit-button').show();
    
      $('#combobox').val(filter.field);
      $('#combo-input').val(mart.fieldInfo[filter.field].label);
      $('#current-value').val(filter.value);
    
      mart.createSlider(filter.field);
      if(mart.fieldInfo[filter.field].type === 'string') {
        mart.addAutoComplete(filter.field);
      }
    
      if(filter.value.match(/\[.+? TO .+?\]/)) {
        var values = filter.value.split(/(\[| TO |\])/);
      
        if(mart.fieldInfo[filter.field].type === 'int') {
          $("#slide").slider( "values", [values[2], values[4]] );
        }
        else {
          $("#slide").slider( "values", [values[2] * 1000, values[4] * 1000] );
        }
      }
    });
  
    $("[id^=cancel-filter-]").on('click', function(event) {
      event.preventDefault();
    
      mart.resetFilterInput();
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
            var groupID = mart.filters[id].logicGroup;
            delete mart.filters[id];
          
            var gtmp = [];
          
            // remove it from logicGroups
            for(var i=0; i<mart.logicGroups[groupID].filters.length; i++) {
              if(mart.logicGroups[groupID].filters[i].id != id) {
                gtmp.push(mart.logicGroups[groupID].filters[i]);
              }
            }
          
            mart.logicGroups[groupID].filters = gtmp;
          
            mart.resetFilterInput();
          
            // redraw
            mart.updateQueryString();
            $(this).dialog("close");
          
            if($('#auto_update').prop('checked')) {
              mart.doSearch(true);
            }
            else {
              mart.highlightSearch();
            }
          },
          "Cancel": function() {
            $(this).dialog("close");
          }
        }
      });
    });
  },

  updateDownloadURL: function (event) {
    var type = event.data.type;
  
    // var fields = [];
    // for(var i=0; i<mart.order.length; i++) {
    //   var field = mart.order[i];
    //   if(!mart.fieldInfo[field].hidden) { fields.push(field); }
    // }
  
    $('.download-' + type).attr('href', $('#url-value').prop("value"));// + '&wt=' + type + '&rows=999999999&fl=' + fields.toString());
  },

  // this function updates cookies that store field order and hidden state
  updateCookies: function () {
    var order = this.order;
    var hidden = {};
    var summaries = this.summaries;
  
    for(var k in this.fieldInfo) {
      if(this.fieldInfo[k].hidden) { hidden[k] = true; }
    }
  
    this.eraseCookie('order');
    this.eraseCookie('hidden');
    this.eraseCookie('summaries');
  
    this.createCookie('order', JSON.stringify(order), (10 * 365));
    this.createCookie('hidden', JSON.stringify(hidden), (10 * 365));
    this.createCookie('summaries', JSON.stringify(summaries), (10 * 365));
  },

  createCookie: function (name, value, days) {
    var expires;

    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toGMTString();
    } else {
      expires = "";
    }
    document.cookie = escape(name) + "=" + escape(value) + expires + "; path=/";
  },

  readCookie: function (name) {
    var nameEQ = escape(name) + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return unescape(c.substring(nameEQ.length, c.length));
    }
    return null;
  },

  eraseCookie: function (name) {
    this.createCookie(name, "", -1);
  }
};

$(document).ready(function() {
  mart.init();
});


function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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