/*
 * jQuery.tagBox plugin
 * https://github.com/jbt/tagBox
 *
 * Author: James Taylor <jt@gosquared.com>
 * License: MIT
 */

// Production steps of ECMA-262, Edition 5, 15.4.4.14
// Reference: http://es5.github.io/#x15.4.4.14
if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function(searchElement, fromIndex) {

    var k;

    // 1. Let O be the result of calling ToObject passing
    //    the this value as the argument.
    if (this == null) {
      throw new TypeError('"this" is null or not defined');
    }

    var O = Object(this);

    // 2. Let lenValue be the result of calling the Get
    //    internal method of O with the argument "length".
    // 3. Let len be ToUint32(lenValue).
    var len = O.length >>> 0;

    // 4. If len is 0, return -1.
    if (len === 0) {
      return -1;
    }

    // 5. If argument fromIndex was passed let n be
    //    ToInteger(fromIndex); else let n be 0.
    var n = +fromIndex || 0;

    if (Math.abs(n) === Infinity) {
      n = 0;
    }

    // 6. If n >= len, return -1.
    if (n >= len) {
      return -1;
    }

    // 7. If n >= 0, then Let k be n.
    // 8. Else, n<0, Let k be len - abs(n).
    //    If k is less than 0, then let k be 0.
    if (n < 0) {
      n = len - Math.abs(n);
    }
    k = Math.max(n, 0);

    // 9. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ToString(k).
      //   This is implicit for LHS operands of the in operator
      // b. Let kPresent be the result of calling the
      //    HasProperty internal method of O with argument Pk.
      //   This step can be combined with c
      // c. If kPresent is true, then
      //    i.  Let elementK be the result of calling the Get
      //        internal method of O with the argument ToString(k).
      //   ii.  Let same be the result of applying the
      //        Strict Equality Comparison Algorithm to
      //        searchElement and elementK.
      //  iii.  If same is true, return k.
      if (k in O && O[k] === searchElement) {
        return k;
      }
      k++;
    }
    return -1;
  };
}

;(function($, window, undefined){

/*
 * fuzzyMatch String matching algorithm
 * https://github.com/jbt/fuzzyMatch
 *
 * Author: James Taylor <jt@gosquared.com>
 * License: MIT
 */

var fuzzyMatch = (function(){
  /**
   * ## escapeRegex
   *
   * Escapes special characters in a string to use when creating a new RegExp
   *
   * @param {string} term String to escape
   * @return {string} Regex-compatible escaped string
   */
  function escapeRegex(term){
    return term.replace(/[\[\]\{\}\(\)\^\$\.\*\+\|]/g, function(a){
      return '\\' + a;
    });
  }

  // A few heper constants; they don't really do much, but they
  // indicate the corresponding rows and columns in the matrix below.
  var UPPER = 0, LOWER = 1, NUMBER = 2, COMMON_DELIMS = 3, OTHER = 4;

  // Amount by which one character stands out when compared
  // to another character. Row = character in question,
  // col = character to compare to. E.g. uppercase letter
  // stands out with a factor of 240 compared to lowercase letter.
  // These numbers are pretty much plucked out of thin air.
  var relevanceMatrix = [
    [  0,   240,   120,   240,   220],
    [ 20,     0,    20,   120,   120],
    [140,   140,     0,   140,   140],
    [120,   120,   120,     0,   120],
    [120,   120,   120,   160,     0]
  ];

  /**
   * ## charType
   *
   * Categorizes a character as either lowercase, uppercase,
   * digit, strong delimiter, or other.
   *
   * @param {string} c The character to check
   * @return {number} One of the constants defined above
   */
  function charType(c){
    if(/[a-z]/.test(c)) return LOWER;
    if(/[A-Z]/.test(c)) return UPPER;
    if(/[0-9]/.test(c)) return NUMBER;
    if(/[\/\-_\.]/.test(c)) return COMMON_DELIMS;
    return OTHER;
  }

  /**
   * ## compareCharacters
   *
   * Compares a character to the characters before and
   * after it to see how much it stands out. For example
   * The letter B would stand out strongly in aBc
   *
   * @param {string} theChar The character in question
   * @param {string} before The immediately preceding character
   * @param {string} after The immediately following character
   * @return {number} Score according to how much the character stands out
   */
  function compareCharacters(theChar, before, after){

    // Grab the character types of all three characters
    var theType = charType(theChar),
        beforeType = charType(before),
        afterType = charType(after);

    // **MAGIC NUMBER ALERT** 0.4 is a number that makes it work best in my tests
    return relevanceMatrix[theType][beforeType] +
     0.4 * relevanceMatrix[theType][afterType];
  }

  /**
   * ## stripAccents
   *
   * Replaces all accented characters in a string with their
   * unaccented equivalent.
   *
   * @param {string} str The input accented string
   * @return {string} String with accents removed
   */
  var stripAccents = (function(accented, unaccented){
    var matchRegex = new RegExp('[' + accented + ']', 'g'),
        translationTable = {}, i;
        lookup = function(chr){
          return translationTable[chr] || chr;
        };

    for(i = 0; i < accented.length; i += 1){
      translationTable[accented.charAt(i)] = unaccented.charAt(i);
    }

    return function(str){
      return str.replace(matchRegex, lookup);
    };
  })('àáâãäçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
     'aaaaaceeeeiiiinooooouuuuyyAAAAACEEEEIIIINOOOOOUUUUY');

  /**
   * ## bestRank
   *
   * The real meat of this searching algorithm. Provides a score for a
   * given string against a given search term.
   *
   * The `startingFrom` parameter is necessary (rather than just truncating
   * `item` so we can use the initial characters of `item` to provide better
   * context.
   *
   * @param {string} item The string to rank
   * @param {string} term The search term against which to rank it
   * @param {number} startingFrom Ignore the first _n_ characters
   * @return {object} Rank of `item` against `term` with highlights
   */
  function bestRank(item, term, startingFrom){

    // If we've reached the end of our search term, add some extra points for being short
    if(term.length === 0) return startingFrom * 100 / item.length;

    // If we've reached the end of the item but not the term, then fail.
    if(item.length === 0) return -1;

    // Quick sanity check to make sure the remaining item has all the characters we need in order
    if(!item.slice(startingFrom).match(
      new RegExp( ('^.*' + escapeRegex(term.split('').join('~~K~~')) + '.*$').split('~~K~~').join('.*'), 'i' )
    )){
      return -1;
    }

    // Grab the first character that we're going to look at
    var firstSearchChar = term.charAt(0);

    // These variables store our best guess so far, and the character
    // indices to which it applies
    var bestRankSoFar = -1;
    var highlights;

    // Now loop over the item, and test all instances of `firstSearchChar` (case-insensitive)
    for(var i = startingFrom; i < item.length; i += 1){
      if(item.charAt(i).toLowerCase() !== firstSearchChar.toLowerCase()) continue;

      // Find out what the rest of the string scores against the rest of the term
      var subsequentRank = bestRank(item.substr(i), term.slice(1), 1);
      if(subsequentRank == -1) continue;

      // Inverse linear score for the character. Earlier in string = much better
      var characterScore = 400 / Math.max(1, i);

      // If, starting at this character, we have the whole of the search term in order, that's really
      // good. And if the term is really long, make it cubically good (quadratic scores added up)
      if(item.substr(i).toLowerCase().indexOf(term.toLowerCase()) === 0) characterScore += 3 * term.length * term.length;

      // Add on score for how much this character stands out
      characterScore += compareCharacters(
        item.charAt(i),
        i === 0 ? '/' : item.charAt(i - 1),
        i === item.length - 1 ? '/' : item.charAt(i + 1)
      );

      // Add on score from the rest of the string
      characterScore += subsequentRank;

      // If we've managed to better what we have so far, store it away
      if(characterScore > bestRankSoFar){
        bestRankSoFar = characterScore;

        // Save highlighted characters as well
        highlights = [i];
        var subsequentHighlights = subsequentRank.highlights || [];
        for(var j = 0; j < subsequentHighlights.length; j += 1){
          highlights.push(subsequentHighlights[j] + i);
        }
      }
    }

    // Return an object with valueOf so it can be directly compared using < and >
    // but also stores the highlight indices
    return {
      __score: bestRankSoFar,
      valueOf: function(){ return this.__score; },
      highlights: highlights
    };
  }

  /**
   * ## fuzzyScoreStr
   *
   * Actual function to use when matching an item against a term
   * (bestRank should only be used internally)
   *
   * @param {string} item Item to search
   * @param {string} term Term against which to search
   * @return {object} Rank of `item` against `term` with highlights
   */
  function fuzzyScoreStr(item, term){
    return bestRank(stripAccents(item), stripAccents(term), 0);
  }

  /**
   * ## fuzzyScore
   *
   * Matches an object against a given term with particular weights being
   * applied to different properties. If the given item is instead a string,
   * just match it directly against the term.
   *
   * The `relevances` parameter should be an object containing properties
   * with the same names as those on `item` that should be counted. For
   * example, a value of `{ propA: 2, propB: 1 }` would count matches in
   * `propA` twice as highly as matches in `propB`.
   *
   * The returned `highlights` property contains arrays of character indices
   * to highlight in the term, indexed by the same property names
   *
   * @param {object} item Item containing multiple properties to search
   * @param {string} term Term against which to search
   * @param {object} relevances Object congaining key/val pairs as above
   * @return {object} Rank of `item` against `term` with highlights.
   */
  function fuzzyScore(item, term, relevances){

    // If we have a string, just match it directly
    if(typeof item == 'string') return fuzzyScoreStr(item, term);

    // Initialize the return object
    var result = {
      __score: 0,
      valueOf: function(){ return this.__score; },
      highlights: {}
    };

    // Loop through all the specified properties
    for(var i in relevances){
      if(!relevances.hasOwnProperty(i) || !item.hasOwnProperty(i)) continue;

      // Grab the score for that particular property
      var thatScore = fuzzyScoreStr(item[i], term);

      // Add the rank on to the return object
      result.__score += relevances[i] * thatScore;
      result.highlights[i] = thatScore > 0 ? thatScore.highlights : [];
    }

    return result;
  }

  return fuzzyScore;
})();
var removeEventName = 'tagbox_destroy';

// See jQuery UI
$.cleanData = (function( orig ) {
	return function( elems ) {
		var events, elem, i;
		for ( i = 0; (elem = elems[i]) != null; i++ ) {
			try {

				// Only trigger remove when necessary to save time
				events = $._data( elem, "events" );
				if ( events && events[removeEventName] ) {
					$( elem ).triggerHandler( removeEventName );
				}

			// http://bugs.jquery.com/ticket/8235
			} catch( e ) {}
		}
		orig( elems );
	};
})( $.cleanData );
var DropdownRow = function(item, opts){

  // var self = this;

  var e = document.createElement('div');
  e.className = 'tagbox-item' + (opts['itemClass'] ? ' ' + opts['itemClass'] : '')
  e.__item = item;
  // self.item = item;

  var format = opts['rowFormat'];

  if(typeof format == 'string'){
    if(typeof item == 'string') item = { value: item };
    e.innerHTML = format.replace(/\{\{([^}]*)\}\}/g, function(match, field){
      return item[field];
    });
  }else{
    e.innerHTML = format(item);
  }

  return e;

  // var el = self.el = $(e);
  //
  // self.select = function(){
  //   el.addClass('selected');
  // };
  //
  // self.deselect = function(){
  //   el.removeClass('selected');
  // };

};
var CompletionDropdown = function(tagbox, opts){

  var self = this;

  var selectedRow, selectedIndex, rows;

  var el = self.el = $('<div class="tagbox-dropdown"><div class="tagbox-list"></div></div>')
    .css({
      maxHeight: opts['maxHeight']
    })
    .on('mousedown', function(){
      tagbox.dontHide = true;
    }).on('mouseup', function(){
      tagbox.dontHide = false;
    }).on('mousemove', function(e){
      var r = $(e.target).closest('.tagbox-item');
      if(!r.length) return;
      selectRow(r[0]);
    }).on('click', '.tagbox-item:not(.new-item)', function(e){
      var r = $(e.target).closest('.tagbox-item');
      if(!r.length) return;
      var item = r[0].__item;
      tagbox.addToken(item);
    })
    .hide();

  if(opts['allowNew']){
    var newRow = $('<div class="tagbox-item new-item" />').prependTo(el)
      .on('mousedown', function(){
        tagbox.dontHide = true;
      }).on('mouseup', function(){
        tagbox.dontHide = false;
      }).on('click', function(){
        tagbox.addToken(opts['createNew'](self.newText));
      });
  }

  self.remove = function(){
    self.el.remove();
  };

  self.updatePosition = function(input){
    if(!el.parent().length) return;

    var o1 = el.offset();
    var o2 = input.offset();
    var o3 = el.parent().offset();

    if(el.parent().is('body')){
      // TODO figure out how to take into account margin/padding on body element properly
      o3 = {
        top: 0,
        left: 0
      };
    }

    el.css({
      top: o2.top - o3.top + input.height() + 1,
      left: o2.left - o3.left,
      width: input.outerWidth()
    });
  };

  self.show = function(){
    el.show();
    self.visible = true;
  };

  self.hide = function(){
    el.hide();
    self.visible = false;
  };

  self.getSelected = function(){
    if(selectedRow) return selectedRow.__item;
  };

  self.selectNext = function(){
    if(selectedIndex === rows.length - 1){
      if((opts['allowNew'] && self.newText) || rows.length === 0){
        selectRow(-1);
      }else{
        selectRow(0);
      }
    }else{
      selectRow(selectedIndex + 1);
    }
  };

  self.selectPrevious = function(){
    if(selectedIndex === 0){
      if(opts['allowNew'] && self.newText){
        selectRow(-1);
      }else{
        selectRow(rows.length - 1);
      }
    }else{
      if(selectedIndex === -1) selectedIndex = rows.length;
      selectRow(selectedIndex - 1);
    }
  };

  var scrollTimeout;

  function selectRow(idx, scrollWithTimeout){
    if(selectedRow){
      $(selectedRow).removeClass('selected');
    }
    newRow && newRow.removeClass('selected');
    if(typeof idx !== 'number'){
      idx = rows.indexOf(idx);
    }
    if(idx >= 0){
      selectedRow = rows[idx];
      $(selectedRow).addClass('selected');
      clearTimeout(scrollTimeout);
      if(scrollWithTimeout){
        scrollTimeout = setTimeout(function(){
          scrollToRow(selectedRow);
        }, 80);
      }else{
        scrollToRow(selectedRow);
      }
    }else{
      selectedRow = false;
      newRow && newRow.addClass('selected');
    }
    selectedIndex = idx;
  }

  var srto, sr;

  function scrollToRow(r){
    clearTimeout(srto);
    sr = r;
    srto = setTimeout(reallyScrollToRow, 10);
  }

  function reallyScrollToRow(){
    var r = $(sr);
    var o = r.offset().top - el.offset().top;
    if(o < 0){
      el.scrollTop(o + el.scrollTop());
    }else if(o > el.innerHeight() - r.outerHeight()){
      el.scrollTop(o + el.scrollTop() - el.innerHeight() + r.outerHeight());
    }
  }

  self.setEmptyItem = function(txt){
    if(!newRow) return;
    self.newText = txt;
    if(!txt){
      newRow.hide();
    }else{
      newRow.show().text(opts['newText'].replace(/\{\{txt\}\}/g, txt));
    }
  };

  self.showItems = function(items){
    el.find('.tagbox-list').empty();
    rows = [];

    var tl = el.find('.tagbox-list')[0];

    if(items.length > 0){
      function add(i){
        var row = DropdownRow(items[i], opts);
        tl.appendChild(row);
        // row.el.appendTo(el.find('.tagbox-list'));
        // row.__i = i;
        // row.el.on('mouseover', function(row){ return function(){
        //   selectRow(row, true);
        // }; }(row));
        rows.push(row);
      }

      for(var i = 0; i < Math.min(50, items.length, opts['maxListItems']);) add(i++);

      if(i === 50){
        setTimeout(function(){
          for(;i < Math.min(items.length, opts['maxListItems']);) add(i++);
        }, 20);
      }

      selectRow(0);
    }else if(!opts['allowNew']){
      $('<div class="tagbox-item empty"/>')
        .text(opts['emptyText'])
        .appendTo(el.find('.tagbox-list'));
      selectRow(-1);
    }else{
      selectRow(-1);
    }

    self.show();
  };
};
var Token = function(item, opts){

  var self = this;

  var el = self.el = $('<div class="tagbox-token">' +
                          '<span></span>' +
                          '<a>&times;</a>' +
                        '</div>')
                        .data('token', self);

  var format = opts['tokenFormat'];

  self.value = (typeof item == 'string') ? item : item[opts['valueField']];
  self.item = item;


  if(typeof format == 'string'){
    if(typeof item == 'string') item = { value: item };
    el.children('span').html(format.replace(/\{\{([^}]*)\}\}/g, function(match, field){
      return item[field];
    }));
  }else{
    el.children('span').html(format(item));
  }

  self.remove = function(){
    el.data('token', null);
    el.remove();
    self.item = null;
    self.el = null;
  };

  self.select = function(){
    el.addClass('selected');
  };

  self.deselect = function(){
    el.removeClass('selected');
  };
};
var TagBox = function(el, opts){

  var self = this;

  self.tokens = [];

  var dontFocus = true;

  if(document.activeElement === el){
    dontFocus = false;
  }

  var input = self.input = $(el)
    .hide();
  self.options = opts;

  var wrapper = self.wrapper = $('<div class="tagbox-wrapper empty" />')
    .click(function(e){
      var target = $(e.target).closest('input, .tagbox-token, .tagbox-wrapper');

      if(target.is('.tagbox-token')){
        if($(e.target).is('a')){
          removeToken(target.data('token'));
        }else{
          selectToken(target.data('token'));
        }
      }else{
        deselectCurrentToken();
      }
      newInput.focus();
    })
    .insertBefore(self.input);

  if(opts['className']) wrapper.addClass(opts['className']);

  input.on('invalid', function(e){
    e.preventDefault();

    self.wrapper.addClass('invalid');
  });

  var thePlaceholder = input.attr('placeholder');

  var newInput = $('<input type="text" />')
    .attr({
      autocomplete: input.attr('autocomplete'),
      spellcheck: input.attr('spellcheck'),
      autocapitalize: input.attr('autocapitalize'),
      placeholder: thePlaceholder
    })
    .on('keyup keydown blur update change', resizeInputBox)
    .on('keypress', function(e){
      if(e.keyCode === 13 && newInput.val()){
        e.preventDefault();
        return false;
      }
    })
    .on('blur', function(){
      // addCurrent();
      setTimeout(function(){
        if(!self.dontHide) dropdown.hide();
        wrapper.removeClass('focus');
      }, 20);
      input.triggerHandler('blur');
    })
    .on('keydown', handleKeyDown)
    .on('focus', function(){
      wrapper.addClass('focus');
      input.triggerHandler('focus');
      updateDropdown();
    })
    .appendTo(wrapper);

  self['focus'] = _focus;

  function _focus(){
    newInput.focus();
  }

  var resizer = $('<span />')
    .appendTo(wrapper)
    .css({
      position: 'absolute',
      left: -100000,
      width: 'auto',
      display: 'inline-block',
      whiteSpace: 'nowrap',
      fontSize: input.css('fontSize'),
      fontFamily: input.css('fontFamily'),
      fontWeight: input.css('fontWeight'),
      fontVariant: input.css('fontVariant'),
      letterSpacing: input.css('letterSpacing')
    });

  var dropdown = self.dropdown = new CompletionDropdown(self, opts);

  dropdown.el.appendTo(opts['dropdownContainer']);

  self['items'] = opts['items'];

  if(input.val()){
    var items = self['items'];
    var bits = input.val().split(opts['delimiter']);
    var found;
    for(var i = 0; i < bits.length; i += 1){
      found = false;
      for(var j = 0; j < items.length; j += 1){
        if(items[j][opts['valueField']] == bits[i]){
          addToken(items[j]);
          found = true;
          break;
        }
      }
      if(!found && opts['allowNew']){
        addToken(opts['createNew'](bits[i]));
      }
    }
  }

  var ready = true;

  var id = Math.random().toString().slice(2);

  resizeInputBox(true);
  $(window).on('resize.' + id, function(){
    resizeInputBox(true);
  });

  setTimeout(function(){
    resizeInputBox(true);
    if(!dropdown.el.parent().length) dropdown.el.appendTo(opts['dropdownContainer']);
  }, 500);

function getInputSelection(el) {
    var start = 0, end = 0, normalizedValue, range,
        textInputRange, len, endRange;

    if (typeof el.selectionStart == "number" && typeof el.selectionEnd == "number") {
        start = el.selectionStart;
        end = el.selectionEnd;
    } else {
        range = document.selection.createRange();

        if (range && range.parentElement() == el) {
            len = el.value.length;
            normalizedValue = el.value.replace(/\r\n/g, "\n");

            // Create a working TextRange that lives only in the input
            textInputRange = el.createTextRange();
            textInputRange.moveToBookmark(range.getBookmark());

            // Check if the start and end of the selection are at the very end
            // of the input, since moveStart/moveEnd doesn't return what we want
            // in those cases
            endRange = el.createTextRange();
            endRange.collapse(false);

            if (textInputRange.compareEndPoints("StartToEnd", endRange) > -1) {
                start = end = len;
            } else {
                start = -textInputRange.moveStart("character", -len);
                start += normalizedValue.slice(0, start).split("\n").length - 1;

                if (textInputRange.compareEndPoints("EndToEnd", endRange) > -1) {
                    end = len;
                } else {
                    end = -textInputRange.moveEnd("character", -len);
                    end += normalizedValue.slice(0, end).split("\n").length - 1;
                }
            }
        }
    }

    return {
        start: start,
        end: end
    };
}

  function handleKeyDown(e){

    //var cursorFarRight = (newInput.val().length == newInput[0].selectionStart);
    //var cursorFarLeft = (newInput[0].selectionEnd === 0);
    var inputSelection = getInputSelection(newInput[0]);
    var cursorFarRight = (newInput.val().length == inputSelection.start);
    var cursorFarLeft = (inputSelection.end === 0);

    var theKeyCode = e.keyCode;

    var dontPreventDefault = false;

    // TODO make this a little less simplistic and try explicitly
    // checking whether a visible character has been typed
    if(e.ctrlKey || e.metaKey) dontPreventDefault = true;

    if(theKeyCode === 37){
      if(selectedToken){
        if(selectedToken === self.tokens[0]){
          deselectCurrentToken();
        }else{
          selectToken(self.tokens[self.tokens.indexOf(selectedToken) - 1]);
        }
        return dontPreventDefault;
      }
      if(cursorFarLeft && self.tokens.length){
        selectToken(self.tokens[self.tokens.length - 1]);
      }
    }

    if(theKeyCode === 39){
      if(selectedToken){
        if(selectedToken === self.tokens[self.tokens.length - 1]){
          deselectCurrentToken();
        }else{
          selectToken(self.tokens[self.tokens.indexOf(selectedToken) + 1]);
        }
        return dontPreventDefault;
      }
      if(cursorFarRight && self.tokens.length){
        selectToken(self.tokens[0]);
      }
    }

    if(selectedToken &&
      (theKeyCode === 46 || // delete
       theKeyCode === 8 )   // backspace
    ){
      removeToken(selectedToken, theKeyCode === 8 ? -1 : 1);
      return dontPreventDefault;
    }

    if(theKeyCode === 8 && cursorFarLeft && self.tokens.length){
      selectToken(self.tokens[self.tokens.length - 1]);
      return dontPreventDefault;
    }

    if(dropdown.visible){
      if(theKeyCode === 38){
        dropdown.selectPrevious();
        return dontPreventDefault;
      }
      if(theKeyCode === 40){
        dropdown.selectNext();
        return dontPreventDefault;
      }

      if((theKeyCode == 39 &&
            cursorFarRight) || // right, but only if we're at the furthest
          theKeyCode == 13 || // enter
    //    theKeyCode == 32 || // space
          theKeyCode == 9  ){ // tab

        addCurrent();
        return dontPreventDefault;
      }
    }else if(newInput.val()){
      if(theKeyCode == 13// ||
     //  theKeyCode == 32 ||
     //    theKeyCode == 9
     ){
        return dontPreventDefault;
      }
    }

    // Don't allow typing if we've hit the maximum
    if(self.tokens.length === opts['maxItems'] && !(
        e.keyCode == 9
      )){
      newInput.val('');
      return dontPreventDefault;
    }

    //if(String.fromCharCode(e.which)){
      setTimeout(updateDropdown, 10);
    //}
  }

  function addCurrent(){
    if(!dropdown.visible) return;
    var selection = dropdown.getSelected();

    if(selection){
      addToken(selection);
    }else if(opts['allowNew'] && newInput.val()){
      addToken(opts['createNew'](newInput.val()));
    }
  }

  function addToken(selectedItem){
    var t = new Token(selectedItem, opts);

    t.el.insertBefore(newInput);
    t.el.css('maxWidth', self.wrapper.width());

    self.tokens.push(t);
    wrapper.removeClass('empty');

    if(ready) newInput.val('');
    resizeInputBox(true);
    dropdown.hide();

    if(!dontFocus) newInput.focus();

    updateInput();
  }

  self.addToken = addToken;

  function removeToken(token, reSelect){
    token.remove();

    var idx = self.tokens.indexOf(token);

    self.tokens.splice(idx, 1);

    if(self.tokens.length === 0) wrapper.addClass('empty');

    if(token === selectedToken) selectedToken = undefined;

    updateInput();
    resizeInputBox(true);

    if(reSelect){
      if(reSelect === -1){
        selectToken(self.tokens[idx - 1]);
      }else if(reSelect === 1){
        selectToken(self.tokens[idx]);
      }
    }

    updateDropdown();

  }

  function updateInput(){
    var values = [];
    for(var i = 0; i < self.tokens.length; i += 1){
      values.push(self.tokens[i].value);
    }

    input.val(values.join(opts['delimiter']));
    input.trigger('change');
  }

  var selectedToken;

  function selectToken(token){
    if(selectedToken){
      selectedToken.deselect();
    }
    if(selectedToken !== token){
      selectedToken = token;
      token.select();
    }else{
      selectedToken = undefined;
    }
  }

  function deselectCurrentToken(){
    if(selectedToken){
      selectedToken.deselect();
      selectedToken = undefined;
    }
  }

  function scoresObject(){
    var si = opts['searchIn'];
    if(typeof si == 'string'){
      si = [si];
    }
    if($.isArray(si)){
      var scores = {};
      for(var i = 0; i < si.length; i += 1){
        scores[si[i]] = 10;
      }
      return scores;
    }

    return si;
  }

  function alreadyHaveItem(item){
    for(var i = 0; i < self.tokens.length; i += 1){
      if(self.tokens[i].item === item) return true;
    }
    return false;
  }

  var ddto;

  function updateDropdown(){
    clearTimeout(ddto);
    ddto = setTimeout(reallyUpdateDropdown, 20);
  }

  function reallyUpdateDropdown(){
    var items = self['items'];
    var itemsToShow = [];
    var term = newInput.val();
    var relevance = scoresObject();

    wrapper.removeClass('invalid');

    if(self.tokens.length === opts['maxItems']){
      dropdown.hide();
      newInput.removeAttr('placeholder');
      return;
    }else{
      newInput.attr('placeholder', thePlaceholder);
    }

    if(term === '' && !opts['autoShow']){
      dropdown.hide();
      return;
    }

    if(term !== ''){
      for(var i = 0; i < items.length; i += 1){
        var theItem = {
          item: items[i],
          score: fuzzyMatch(items[i], term, relevance)
        };
        if(theItem.score > 0 && (opts['allowDuplicates'] || !alreadyHaveItem(theItem.item))){
          itemsToShow.push(theItem);
        }
      }

      itemsToShow = itemsToShow.sort(function(a, b){
        return b.score - a.score;
      });

      for(var i = 0; i < itemsToShow.length; i += 1){
        itemsToShow[i] = itemsToShow[i].item;
      }
    }else{
      for(var i = 0; i < items.length; i += 1){
        if(opts['allowDuplicates'] || !alreadyHaveItem(items[i])){
          itemsToShow.push(items[i]);
        }
      }
    }

    dropdown.showItems(itemsToShow);
    dropdown.setEmptyItem(term);
    dropdown.updatePosition(wrapper);
  }

  function resizeInputBox(force){
    if(destroyed || (self.currentInput == newInput.val() && (force !== true))) return;

    wrapper.toggleClass('full', self.tokens.length === opts['maxItems']);

    deselectCurrentToken();

    self.currentInput = newInput.val();

    resizer.text(self.currentInput);


    newInput.width(0);

    newInput.width(
      Math.min(
        wrapper.width() - 5,
        Math.max(
          wrapper.width() - newInput.offset().left + wrapper.offset().left - 5,
          resizer.width(),
          1
        )
      )
    );

    dropdown.updatePosition(wrapper);
  }

  dontFocus = false;

  var destroyed;

  function destroy(){
    if(destroyed) return;
    destroyed = true;

    if(self.wrapper.parent()) self.wrapper.remove();
    if(self.input.parent()) self.input.remove();
    dropdown.remove();
    $(window).unbind('resize.' + id);

    input = wrapper = dropdown = self.input = self.wrapper = self.dropdown = null;
  }

  input.on(removeEventName, destroy);
  wrapper.on(removeEventName, destroy);

};
$.fn['tagbox'] = function(opts){

  var defaults = {
    'maxHeight': 200,
    'maxListItems': 20,
    'rowFormat': '{{value}}',
    'tokenFormat': '{{value}}',
    'valueField': 'value',
    'searchIn': ['value'],
    'delimiter': ',',
    'allowDuplicates': false,
    'createNew': function(txt){ return { value: txt }; },
    'allowNew': false,
    'newText': '{{txt}}',
    'emptyText': 'Not Found',
    'dropdownContainer': 'body',
    'maxItems': -1,
    'autoShow': false
  };

  var options = $.extend({}, defaults, opts);

  return this.each(function(){
    if($(this).data('tagbox')) return;

    var tb = new TagBox(this, options);
    $(this).data('tagbox', tb);
  });

};
})(jQuery, window);
