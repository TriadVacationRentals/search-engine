document.addEventListener('DOMContentLoaded', function() {

const WORKER_URL = 'https://hostaway-proxy.triad-sync.workers.dev';
let debounceTimer = null;
let selectedLocation = null;
let guests = 2;
let checkIn = null;
let checkOut = null;
let currentMonth = new Date();
let isSelectingCheckout = false;

const searchTrigger = document.getElementById('searchTrigger');
const bookingPanel = document.getElementById('bookingPanel');
const locationInput = document.getElementById('locationInput');
const locationDropdown = document.getElementById('locationDropdown');

// Location autocomplete
locationInput.addEventListener('input', function() {
  const query = this.value.trim();
  clearTimeout(debounceTimer);
  
  if (query.length < 3) {
    locationDropdown.classList.remove('active');
    return;
  }
  
  debounceTimer = setTimeout(() => {
    fetchLocationSuggestions(query);
  }, 300);
});

async function fetchLocationSuggestions(query) {
  try {
    const response = await fetch(`${WORKER_URL}/api/places/autocomplete?input=${encodeURIComponent(query)}`);
    const data = await response.json();
    
    if (data.predictions && data.predictions.length > 0) {
      displayLocationSuggestions(data.predictions);
    }
  } catch (error) {
    console.error('Location error:', error);
  }
}

function displayLocationSuggestions(predictions) {
  locationDropdown.innerHTML = predictions.map(p => 
    `<div class="location-dropdown-item" data-place-id="${p.place_id}">${p.description}</div>`
  ).join('');
  
  locationDropdown.classList.add('active');
  
  locationDropdown.querySelectorAll('.location-dropdown-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      locationInput.value = this.textContent;
      selectedLocation = {
        description: this.textContent,
        place_id: this.dataset.placeId
      };
      locationDropdown.classList.remove('active');
    });
  });
}

// Show panel when trigger clicked
searchTrigger.addEventListener('click', function() {
  searchTrigger.classList.add('hidden');
  setTimeout(() => {
    bookingPanel.classList.add('visible');
    setTimeout(() => {
      togglePanel();
    }, 100);
  }, 300);
});

document.getElementById('panelHeader').addEventListener('click', function(e) {
  if (e.target.id !== 'closeBtn') togglePanel();
});

document.getElementById('closeBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  closePanel();
});

document.getElementById('bookingOverlay').addEventListener('click', closePanel);

document.getElementById('checkInBox').onclick = toggleCalendar;
document.getElementById('checkOutBox').onclick = function() {
  if (!this.classList.contains('disabled')) {
    toggleCalendar();
  }
};

document.getElementById('guestBox').onclick = toggleGuests;
document.getElementById('guestMinus').onclick = () => changeGuests(-1);
document.getElementById('guestPlus').onclick = () => changeGuests(1);

function togglePanel() {
  const panel = document.getElementById('bookingPanel');
  const overlay = document.getElementById('bookingOverlay');
  
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  } else {
    panel.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closePanel() {
  document.getElementById('bookingPanel').classList.remove('open');
  document.getElementById('bookingOverlay').classList.remove('open');
  document.body.style.overflow = '';
  
  setTimeout(() => {
    bookingPanel.classList.remove('visible');
    setTimeout(() => {
      searchTrigger.classList.remove('hidden');
    }, 400);
  }, 100);
  
  const cal = document.getElementById('calendar');
  const guests = document.getElementById('guestPopup');
  const dateSection = document.querySelector('.date-section');
  const guestSection = document.querySelector('.guest-section');
  const locationField = document.querySelector('.input-box#locationField').parentElement;
  
  if (cal.classList.contains('active')) {
    cal.classList.remove('active');
    document.getElementById('checkInBox').classList.remove('active');
    document.getElementById('checkOutBox').classList.remove('active');
    locationField.style.display = 'block';
    dateSection.style.display = 'grid';
    guestSection.style.display = 'block';
  }
  
  if (guests.classList.contains('active')) {
    guests.classList.remove('active');
    document.getElementById('guestBox').classList.remove('active');
  }
}

function toggleCalendar() {
  const cal = document.getElementById('calendar');
  const guests = document.getElementById('guestPopup');
  const dateSection = document.querySelector('.date-section');
  const guestSection = document.querySelector('.guest-section');
  const locationField = document.querySelector('.input-box#locationField').parentElement;
  
  guests.classList.remove('active');
  document.getElementById('guestBox').classList.remove('active');
  
  if (cal.classList.contains('active')) {
    cal.classList.remove('active');
    document.getElementById('checkInBox').classList.remove('active');
    document.getElementById('checkOutBox').classList.remove('active');
    locationField.style.display = 'block';
    dateSection.style.display = 'grid';
    guestSection.style.display = 'block';
  } else {
    cal.classList.add('active');
    document.getElementById('checkInBox').classList.add('active');
    document.getElementById('checkOutBox').classList.add('active');
    locationField.style.display = 'none';
    dateSection.style.display = 'none';
    guestSection.style.display = 'none';
    isSelectingCheckout = false;
    renderCalendar();
  }
}

function toggleGuests() {
  const guests = document.getElementById('guestPopup');
  const box = document.getElementById('guestBox');
  
  if (guests.classList.contains('active')) {
    guests.classList.remove('active');
    box.classList.remove('active');
  } else {
    guests.classList.add('active');
    box.classList.add('active');
  }
}

function renderCalendar() {
  const month = new Date(currentMonth);
  const monthName = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const viewTitle = isSelectingCheckout ? 'Select check-out date' : 'Select check-in date';
  const titleColor = isSelectingCheckout ? '#16A8EE' : '#0F2C3A';
  
  document.getElementById('calendar').innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 16px; font-weight: 600; color: ${titleColor}; text-align: center; margin-bottom: 16px; padding: 12px; background: ${isSelectingCheckout ? '#e8f6fd' : '#f3f4f6'}; border-radius: 8px;">${viewTitle}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <button onclick="changeMonth(-1)" style="width: 32px; height: 32px; border: 1px solid #e5e7eb; background: white; border-radius: 8px; cursor: pointer;">←</button>
        <div style="font-size: 16px; font-weight: 600;">${monthName}</div>
        <button onclick="changeMonth(1)" style="width: 32px; height: 32px; border: 1px solid #e5e7eb; background: white; border-radius: 8px; cursor: pointer;">→</button>
      </div>
    </div>
    ${renderMonthGrid(month)}
    <div style="text-align: right; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <button onclick="clearDates()" style="background: none; border: none; color: ${checkIn || checkOut ? '#16A8EE' : '#9ca3af'}; font-size: 14px; font-weight: 500; cursor: ${checkIn || checkOut ? 'pointer' : 'not-allowed'}; padding: 8px 16px; border-radius: 8px;" ${!checkIn && !checkOut ? 'disabled' : ''}>Clear dates</button>
    </div>
  `;
  
  attachDayListeners();
}

function renderMonthGrid(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0,0,0,0);
  
  let html = '<div class="weekdays">';
  ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
    html += `<div class="weekday">${d}</div>`;
  });
  html += '</div><div class="days">';
  
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="day empty"></div>';
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDate(date);
    const isPast = date < today;
    
    let cls = 'day';
    if (isPast) {
      cls += ' past';
    } else {
      cls += ' available';
    }
    
    if (checkIn === dateStr || checkOut === dateStr) {
      cls += ' selected';
    } else if (checkIn && checkOut && dateStr > checkIn && dateStr < checkOut) {
      cls += ' in-range';
    }
    
    html += `<div class="${cls}" data-date="${dateStr}">${day}</div>`;
  }
  
  html += '</div>';
  return html;
}

function attachDayListeners() {
  document.querySelectorAll('.day.available').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      selectDate(el.dataset.date);
    };
  });
}

function selectDate(dateStr) {
  if (!isSelectingCheckout) {
    checkIn = dateStr;
    checkOut = null;
    
    document.getElementById('checkOutBox').classList.remove('disabled');
    
    const d = new Date(dateStr);
    document.getElementById('checkInDisplay').textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    document.getElementById('checkInDisplay').classList.remove('placeholder');
    document.getElementById('checkOutDisplay').textContent = 'Add date';
    document.getElementById('checkOutDisplay').classList.add('placeholder');
    
    isSelectingCheckout = true;
    renderCalendar();
  } else {
    if (dateStr <= checkIn) {
      showError('Check-out must be after check-in');
      return;
    }
    checkOut = dateStr;
    
    const d = new Date(dateStr);
    document.getElementById('checkOutDisplay').textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    document.getElementById('checkOutDisplay').classList.remove('placeholder');
    
    isSelectingCheckout = false;
    toggleCalendar();
  }
}

window.changeMonth = function(delta) {
  currentMonth.setMonth(currentMonth.getMonth() + delta);
  renderCalendar();
}

window.clearDates = function() {
  checkIn = null;
  checkOut = null;
  isSelectingCheckout = false;
  
  document.getElementById('checkInDisplay').textContent = 'Add date';
  document.getElementById('checkInDisplay').classList.add('placeholder');
  document.getElementById('checkOutDisplay').textContent = 'Add date';
  document.getElementById('checkOutDisplay').classList.add('placeholder');
  document.getElementById('checkOutBox').classList.add('disabled');
  
  renderCalendar();
}

function changeGuests(delta) {
  guests = Math.max(1, Math.min(30, guests + delta));
  updateGuestDisplay();
}

function updateGuestDisplay() {
  const text = guests + ' guest' + (guests !== 1 ? 's' : '');
  document.getElementById('guestDisplay').textContent = text;
  document.getElementById('guestNumber').textContent = guests;
  document.getElementById('guestMinus').disabled = guests <= 1;
  document.getElementById('guestPlus').disabled = guests >= 30;
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 5000);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Search button
document.getElementById('bookBtn').addEventListener('click', function() {
  if (!selectedLocation) {
    showError('Please enter a location');
    return;
  }
  if (!checkIn || !checkOut) {
    showError('Please select check-in and check-out dates');
    return;
  }
  
  const params = new URLSearchParams({
    location: selectedLocation.description,
    checkin: checkIn,
    checkout: checkOut,
    guests: guests
  });
  
  window.location.href = `/listings?${params.toString()}`;
});

updateGuestDisplay();

}); // End DOMContentLoaded
