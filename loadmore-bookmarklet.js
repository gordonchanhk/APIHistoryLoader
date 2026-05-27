/*
 * "Load More" bookmarklet for PayPal REST API History
 *
 * Usage:
 *   1. Create a new bookmark in your browser
 *   2. Set the URL to the minified javascript: line at the bottom of this file
 *   3. Navigate to apihistory.paypal.com and run a search
 *   4. Click the bookmark — a "Load More" button appears next to the back arrow
 *   5. Click it to fetch the next page of older records and append them to the table
 *   6. Repeat as needed
 *
 * How it works:
 *   - Reads the current form fields (searchType, searchValue, etc.)
 *   - Sets end_time to the earliest record's create_time (to fetch older records)
 *   - Fires the same AJAX GET to "searchresults" that the original search uses
 *   - Deduplicates by correlation_id and appends new records to tableItems
 *   - Destroys and re-renders the bootstrap-table with the merged dataset
 *   - Updates the summary bar and "Load More" button label
 */
(function () {
  /* Guard: only run on the right site */
  if (!window.jQuery || typeof tableItems === 'undefined') {
    alert('This bookmarklet must be run on the API History search results page.');
    return;
  }

  /* Avoid double-injection */
  if (document.getElementById('loadMoreBtn')) {
    document.getElementById('loadMoreBtn').style.outline = '2px solid orange';
    setTimeout(function () { document.getElementById('loadMoreBtn').style.outline = ''; }, 600);
    return;
  }

  var $ = window.jQuery;
  var totalLoaded = tableItems.length;
  var isLoading = false;

  /* ---- Create the button ---- */
  var btn = document.createElement('button');
  btn.id = 'loadMoreBtn';
  btn.type = 'button';
  btn.className = 'btn btn-success btn-sm';
  btn.style.cssText = 'margin-left:8px; margin-top:-3px; font-weight:bold;';
  btn.innerHTML = '<span class="fa fa-download"></span> Load More';

  /* Insert next to the back button / inside the header message bar */
  var headerMsg = document.getElementById('headerMsg');
  if (headerMsg) {
    headerMsg.appendChild(btn);
  } else {
    /* Fallback: insert above the table */
    var fc = document.getElementById('form-container');
    if (fc) fc.after(btn);
  }

  /* ---- Also add an "Export All" button to download tableItems as JSON ---- */
  var exportBtn = document.createElement('button');
  exportBtn.id = 'exportAllBtn';
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-outline-info btn-sm';
  exportBtn.style.cssText = 'margin-left:8px; margin-top:-3px;';
  exportBtn.innerHTML = '<span class="fa fa-save"></span> Export JSON';
  exportBtn.title = 'Download all loaded records as a .txt file (for use in Local REST API Explorer)';
  if (headerMsg) headerMsg.appendChild(exportBtn);

  exportBtn.addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(tableItems, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var searchVal = $('#searchValue').val() || 'export';
    a.download = searchVal + '-' + tableItems.length + 'records.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  /* ---- Load More logic ---- */
  function getEarliestTime() {
    var sorted = tableItems.slice().sort(function (a, b) {
      return new Date(a.create_time).getTime() - new Date(b.create_time).getTime();
    });
    return sorted[0].create_time;
  }

  function updateLabel() {
    btn.innerHTML = '<span class="fa fa-download"></span> Load More (' + tableItems.length + ' loaded)';
  }

  function updateSummary() {
    var items = tableItems;
    var m_earliest = moment(items[items.length - 1].create_time);
    var m_latest = moment(items[0].create_time);
    var days = m_latest.diff(m_earliest, 'days');
    var hours = m_latest.diff(m_earliest, 'hours');
    var min = m_latest.diff(m_earliest, 'minutes');
    var sec = m_latest.diff(m_earliest, 'seconds');

    var summary = items.length + ' events spanning ';
    if (days) summary += days + ' days';
    else if (hours) summary += hours + ' hours';
    else if (min) summary += min + ' minutes';
    else summary += sec + ' seconds';

    /* Update the inline text in headerMsg (between back/forward buttons) */
    var inlineDiv = $('#headerMsg > div');
    if (inlineDiv.length) inlineDiv.text(summary);
  }

  function mergeAndRender(newItems) {
    /* Deduplicate by correlation_id */
    var existing = {};
    tableItems.forEach(function (r) { existing[r.correlation_id] = true; });

    var added = 0;
    newItems.forEach(function (r) {
      if (!existing[r.correlation_id]) {
        tableItems.push(r);
        existing[r.correlation_id] = true;
        added++;
      }
    });

    if (added === 0) return 0;

    /* Sort descending */
    tableItems.sort(function (a, b) {
      return new Date(b.create_time).getTime() - new Date(a.create_time).getTime();
    });

    /* Update spansDays global for timestamp formatting */
    var m_e = moment(tableItems[tableItems.length - 1].create_time);
    var m_l = moment(tableItems[0].create_time);
    window.spansDays = m_l.diff(m_e, 'days') > 1;

    /* Destroy and re-render the table */
    $('#tableResults').bootstrapTable('destroy');
    renderTable(tableItems);

    /* Update back button href */
    var earliest = tableItems[tableItems.length - 1].create_time;
    var backUrl = replaceUrlParameter(window.location.href, 'enddate', earliest);
    backUrl = replaceUrlParameter(backUrl, 'startdate', '');
    $('#backButton').attr('href', backUrl);

    updateSummary();
    document.title = tableItems.length + ' events - REST API History';

    return added;
  }

  var stopRequested = false;

  /* ---- Stop button (hidden until auto-loading) ---- */
  var stopBtn = document.createElement('button');
  stopBtn.id = 'stopLoadBtn';
  stopBtn.type = 'button';
  stopBtn.className = 'btn btn-warning btn-sm';
  stopBtn.style.cssText = 'margin-left:4px; margin-top:-3px; display:none;';
  stopBtn.innerHTML = '<span class="fa fa-stop"></span> Stop';
  btn.after(stopBtn);

  stopBtn.addEventListener('click', function () {
    stopRequested = true;
    stopBtn.disabled = true;
    stopBtn.innerHTML = '<span class="fa fa-pause"></span> Stopping...';
  });

  function fetchNextPage() {
    var earliestTime = getEarliestTime();
    var earliestMoment = moment.utc(earliestTime).tz(ianaTimezone);

    /* Save original form values so we can restore them after serialize */
    var origStartTime = $('#start_time').val();
    var origEndTime = $('#end_time').val();
    var origFStartDate = $('#fStartDate').val();
    var origFEndDate = $('#fEndDate').val();

    /* Set all four date fields in sync */
    var startMomentUtc = moment.utc(earliestTime).subtract(1, 'month');
    var startMomentLocal = startMomentUtc.clone().tz(ianaTimezone);

    $('#end_time').val(earliestTime);
    $('#fEndDate').val(earliestMoment.format('YYYY-MM-DD HH:mm:ss'));
    $('#start_time').val(startMomentUtc.format('YYYY-MM-DDTHH:mm:ss') + 'Z');
    $('#fStartDate').val(startMomentLocal.format('YYYY-MM-DD HH:mm:ss'));

    var formData = $('#frmSearch').serialize();

    /* Restore original form values */
    $('#start_time').val(origStartTime);
    $('#end_time').val(origEndTime);
    $('#fStartDate').val(origFStartDate);
    $('#fEndDate').val(origFEndDate);

    var pageNum = Math.floor((tableItems.length - totalLoaded) / 50) + 1;
    btn.innerHTML = '<span class="fa fa-spinner fa-spin"></span> Loading page ' + pageNum + '... (' + tableItems.length + ' so far)';

    $.ajax({
      url: 'searchresults',
      data: formData,
      type: 'get',
      complete: function (rData) {
        try {
          var obj = JSON.parse(rData.responseText);
          if (obj.errors) {
            finishLoading('<span class="fa fa-exclamation-triangle"></span> Error - click to retry (' + tableItems.length + ')');
            console.error('Load More error:', obj.errors);
            return;
          }
          if (!obj.items || obj.items.length === 0) {
            finishLoading('<span class="fa fa-check"></span> All loaded (' + tableItems.length + ' total)');
            btn.disabled = true;
            return;
          }

          var added = mergeAndRender(obj.items);

          if (added === 0) {
            /* Server returned items but all were duplicates — no progress */
            finishLoading('<span class="fa fa-check"></span> All loaded (' + tableItems.length + ' total)');
            btn.disabled = true;
            return;
          }

          if (stopRequested) {
            finishLoading('<span class="fa fa-download"></span> Load More (' + tableItems.length + ' loaded)');
            return;
          }

          /* Continue to next page */
          fetchNextPage();

        } catch (e) {
          finishLoading('<span class="fa fa-exclamation-triangle"></span> Parse error (' + tableItems.length + ')');
          console.error('Load More parse error:', e);
        }
      }
    });
  }

  function finishLoading(label) {
    isLoading = false;
    stopRequested = false;
    btn.disabled = false;
    btn.innerHTML = label;
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
    stopBtn.innerHTML = '<span class="fa fa-stop"></span> Stop';
  }

  btn.addEventListener('click', function () {
    if (isLoading) return;
    isLoading = true;
    stopRequested = false;
    btn.disabled = true;
    stopBtn.style.display = 'inline-block';
    fetchNextPage();
  });

  updateLabel();
})();
