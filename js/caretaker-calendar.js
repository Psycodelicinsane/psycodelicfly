(function() {
  var API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';
  var calendarSection = null;
  var calendarContent = null;
  var calendarToggle = null;
  var selectedDate = null;
  var currentMonth = null;
  var scores = {};

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatDateStr(year, month, day) {
    return year + '-' + pad(month) + '-' + pad(day);
  }

  function togglePanel() {
    if (calendarContent === null) return;
    if (calendarContent.classList.contains('collapsed')) {
      calendarContent.classList.remove('collapsed');
      calendarToggle.textContent = 'Ocultar';
    } else {
      calendarContent.classList.add('collapsed');
      calendarToggle.textContent = 'Mostrar';
    }
  }

  function fetchAndRender() {
    var startDate = currentMonth.getFullYear() + '-' + pad(currentMonth.getMonth() + 1) + '-01';
    var lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    var endDate = lastDay.getFullYear() + '-' + pad(lastDay.getMonth() + 1) + '-' + pad(lastDay.getDate());
    fetch(API_URL + '/calendar/scores?start=' + startDate + '&end=' + endDate)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        scores = {};
        for (var i = 0; i < data.length; i++) {
          scores[data[i].date] = data[i];
        }
        renderCalendar();
      })
      .catch(function(err) {
        console.warn('[calendar] fetch error:', err.message);
      });
  }

  function renderCalendar() {
    if (calendarContent === null) return;
    var monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    var monthName = monthNames[currentMonth.getMonth()];
    var year = currentMonth.getFullYear();

    var navHtml = '<div class="cal-nav">' +
      '<button class="cal-nav-btn" id="cal-prev" title="Mes anterior" aria-label="Mes anterior">&lt;</button>' +
      '<span class="cal-nav-title">' + monthName + ' de ' + year + '</span>' +
      '<button class="cal-nav-btn" id="cal-next" title="Mes siguiente" aria-label="Mes siguiente">&gt;</button>' +
      '</div>';

    var gridHtml = '<div class="cal-grid">' +
      '<div class="cal-dow" title="Lunes">Lun</div><div class="cal-dow" title="Martes">Mar</div><div class="cal-dow" title="Miércoles">Mié</div>' +
      '<div class="cal-dow" title="Jueves">Jue</div><div class="cal-dow" title="Viernes">Vie</div><div class="cal-dow" title="Sábado">Sáb</div>' +
      '<div class="cal-dow" title="Domingo">Dom</div>';


    var firstDayOfWeek = (new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay() + 6) % 7;
    var daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

    for (var i = 0; i < firstDayOfWeek; i++) {
      gridHtml += '<div class="cal-cell cal-empty"></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var dateStr = formatDateStr(currentMonth.getFullYear(), currentMonth.getMonth() + 1, day);
      var score = scores[dateStr];
      var colorClass;
      if (score && score.composite_score !== null) {
        if (score.composite_score > 80) {
          colorClass = 'cal-green';
        } else if (score.composite_score >= 50) {
          colorClass = 'cal-yellow';
        } else {
          colorClass = 'cal-red';
        }
      } else {
        colorClass = 'cal-nodata';
      }
      var selectedClass = selectedDate === dateStr ? ' cal-selected' : '';
      gridHtml += '<div class="cal-cell ' + colorClass + selectedClass + '" data-date="' + dateStr + '">' +
        '<div class="cal-day">' + day + '</div>' +
        (score ? '<div class="cal-score">' + Math.round(score.composite_score) + '</div>' +
          '<div class="cal-details">' +
            '<span title="Incidentes de miedo">' + score.fear_incidents + 'i</span>' +
            '<span title="Comidas">' + score.total_feeds + 'f</span>' +
            '<span title="Hambre media">' + (score.avg_hunger !== null ? score.avg_hunger.toLocaleString('es-ES', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-') + 'h</span>' +
          '</div>' : '') +
        '</div>';
    }

    gridHtml += '</div>';
    calendarContent.innerHTML = navHtml + gridHtml;

    document.getElementById('cal-prev').addEventListener('click', prevMonth);
    document.getElementById('cal-next').addEventListener('click', nextMonth);
  }

  function onCellClick(e) {
    var cell = e.target.closest('.cal-cell');
    if (cell === null || cell.classList.contains('cal-empty')) return;
    var dateStr = cell.getAttribute('data-date');
    if (!dateStr) return;
    if (selectedDate === dateStr) {
      selectedDate = null;
      var allCells = calendarContent.querySelectorAll('.cal-cell');
      for (var i = 0; i < allCells.length; i++) allCells[i].classList.remove('cal-selected');
      restoreFullAlimentar();
      return;
    }
    selectedDate = dateStr;
    var allCells2 = calendarContent.querySelectorAll('.cal-cell');
    for (var j = 0; j < allCells2.length; j++) allCells2[j].classList.remove('cal-selected');
    cell.classList.add('cal-selected');
    filterAlimentarToDate(dateStr);
  }

  function buildEntryEl(entry, includeReasoning) {
    var kind = entry.kind;
    var action = entry.name;
    var params = entry.params;
    var reasoning = entry.reasoning;
    var timestamp = entry.timestamp;

    var colorClass;
    if (kind === 'incident') {
      colorClass = 'incident';
    } else if (action === 'place_food' || action === 'clear_food') {
      colorClass = 'feed';
    } else if (action === 'set_light' || action === 'set_temp') {
      colorClass = 'comfort';
    } else {
      colorClass = 'neutral';
    }

    var icon;
    if (kind === 'incident') {
      icon = '!';
    } else {
      icon = {place_food:'F', clear_food:'X', set_light:'L', set_temp:'T', touch:'H', blow_wind:'W'}[action] || '*';
    }

    var timeStr = new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    var desc;
    if (kind === 'incident') {
      desc = {
        scared_the_fly: 'La mosca se ha sobresaltado.',
        forgot_to_feed: 'La mosca necesita alimento.'
      }[action] || 'Se ha registrado una incidencia.';
    } else {
      var p = {};
      try { if (params) p = JSON.parse(params); } catch (e) { /* ignore */ }
      switch (action) {
        case 'place_food': desc = 'Se ha colocado comida en (' + Math.round(p.x || 0) + ', ' + Math.round(p.y || 0) + ')'; break;
        case 'clear_food': desc = 'Se ha retirado toda la comida'; break;
        case 'set_light': desc = 'La luz se ha ajustado a ' + ({bright:'brillante',dim:'tenue',dark:'oscura'}[p.level] || p.level || 'desconocida'); break;
        case 'set_temp': desc = 'La temperatura se ha ajustado a ' + ({neutral:'neutra',warm:'cálida',cool:'fría'}[p.level] || p.level || 'desconocida'); break;
        case 'touch': desc = 'Se ha tocado la mosca'; break;
        case 'blow_wind': desc = 'Se ha soplado aire'; break;
        default: desc = action;
      }
    }

    var reasoningText = kind === 'incident' || includeReasoning === false ? '' : (reasoning || '');

    var el = document.createElement('div');
    el.className = 'activity-entry activity-' + colorClass;
    el.innerHTML = '<div class="activity-entry-header">' +
      '<span class="activity-icon">' + icon + '</span>' +
      '<span class="activity-time">' + timeStr + '</span>' +
      '<span class="activity-desc">' + desc + '</span>' +
      '</div>' +
      (reasoningText ? '<div class="activity-entry-detail">' + reasoningText + '</div>' : '');
    return el;
  }

  function renderCalendarActivity(entries, heading, emptyMessage) {
    if (calendarContent === null) return;
    var previous = calendarContent.querySelector('.cal-day-activity');
    if (previous) previous.remove();

    var section = document.createElement('div');
    section.className = 'cal-day-activity activity-feed';
    section.setAttribute('aria-live', 'polite');
    var title = document.createElement('div');
    title.className = 'cal-feed-date-header';
    title.textContent = heading;
    section.appendChild(title);

    if (!entries || entries.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cal-no-activity';
      empty.textContent = emptyMessage;
      section.appendChild(empty);
    } else {
      for (var i = 0; i < entries.length; i++) {
        section.appendChild(buildEntryEl(entries[i], false));
      }
    }
    calendarContent.appendChild(section);
  }

  function filterAlimentarToDate(dateStr) {
    fetch(API_URL + '/calendar/day-activity?date=' + dateStr)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var dateParts = dateStr.split('-');
        var dateLabel = dateParts.length === 3 ? dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0] : dateStr;
        renderCalendarActivity(data, 'Registro del día ' + dateLabel, 'No hay acciones registradas ese día.');
        var feedList = document.getElementById('activity-feed-list');
        if (!feedList) return;
        feedList.innerHTML = '';
        if (data.length === 0) {
          feedList.innerHTML = '<div class="cal-no-activity">No hay actividad el ' + dateLabel + '</div>';
          return;
        }
        var header = document.createElement('div');
        header.className = 'cal-feed-date-header';
        header.textContent = 'Registro del día ' + dateLabel;
        feedList.appendChild(header);
        for (var i = 0; i < data.length; i++) {
          feedList.appendChild(buildEntryEl(data[i]));
        }
      })
      .catch(function(err) {
        var dateParts = dateStr.split('-');
        var dateLabel = dateParts.length === 3 ? dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0] : dateStr;
        renderCalendarActivity([], 'Registro del día ' + dateLabel, 'No se pudo cargar el registro.');
        console.warn('[calendar] day-activity fetch error:', err.message);
      });
  }

  function restoreFullAlimentar() {
    var feedList = document.getElementById('activity-feed-list');
    fetch(API_URL + '/activity/recent')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        renderCalendarActivity(data, 'Acciones recientes', 'Aún no hay acciones recientes.');
        if (!feedList) return;
        feedList.innerHTML = '';
        for (var i = 0; i < data.length; i++) {
          feedList.appendChild(buildEntryEl(data[i]));
        }
      })
      .catch(function() {
        if (feedList) feedList.innerHTML = '<div class="cal-no-activity">No se pudo actualizar el registro</div>';
        renderCalendarActivity([], 'Acciones recientes', 'No se pudo actualizar el registro.');
      });
  }

  function prevMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    selectedDate = null;
    fetchAndRender();
  }

  function nextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    selectedDate = null;
    fetchAndRender();
  }

  function init() {
    calendarSection = document.getElementById('calendar-section');
    if (!calendarSection) return;
    calendarContent = document.getElementById('calendar-content');
    calendarToggle = document.getElementById('calendar-toggle');
    if (calendarToggle) calendarToggle.addEventListener('click', togglePanel);
    calendarContent.addEventListener('click', onCellClick);
    currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    fetchAndRender();
  }

  init();
  window.CaretakerCalendar = { init: init, refresh: fetchAndRender };
})();
