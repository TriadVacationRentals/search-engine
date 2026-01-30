    const WORKER_URL = 'https://hostaway-proxy.triad-sync.workers.dev';
    let debounceTimer = null;
    let selectedLocation = null;
    let guestCount = 2;
    let checkinDate = null;
    let checkoutDate = null;
    let currentCheckinMonth = new Date();
    let currentCheckoutMonth = new Date();
    
    // Close popups when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.search-field')) {
        document.querySelectorAll('.location-dropdown, .date-picker-popup, .guest-picker-popup').forEach(popup => {
          popup.classList.remove('active');
        });
      }
    });
    
    // Location Autocomplete
    const locationField = document.getElementById('location-field');
    const locationInput = document.getElementById('location-input');
    const locationDropdown = document.getElementById('location-dropdown');
    
    locationField.addEventListener('click', function(e) {
      e.stopPropagation();
      locationInput.focus();
    });
    
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
    
    // Calendar Functions
    function renderCalendar(type) {
      const month = type === 'checkin' ? currentCheckinMonth : currentCheckoutMonth;
      const daysContainer = document.getElementById(`${type}-days`);
      const monthDisplay = document.getElementById(`${type}-month`);
      
      const year = month.getFullYear();
      const monthIndex = month.getMonth();
      const firstDay = new Date(year, monthIndex, 1).getDay();
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      monthDisplay.textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      let html = '';
      
      // Empty cells before first day
      for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
      }
      
      // Days
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        const isPast = date < today;
        const isSelected = (type === 'checkin' && checkinDate && date.getTime() === checkinDate.getTime()) ||
                          (type === 'checkout' && checkoutDate && date.getTime() === checkoutDate.getTime());
        const isInRange = checkinDate && checkoutDate && date > checkinDate && date < checkoutDate;
        
        let className = 'calendar-day';
        if (isPast) className += ' past';
        else className += ' available';
        if (isSelected) className += ' selected';
        if (isInRange) className += ' in-range';
        
        html += `<div class="${className}" data-date="${date.toISOString()}">${day}</div>`;
      }
      
      daysContainer.innerHTML = html;
      
      // Add click handlers
      daysContainer.querySelectorAll('.calendar-day.available').forEach(dayEl => {
        dayEl.addEventListener('click', function(e) {
          e.stopPropagation(); // Prevent event bubbling
          const date = new Date(this.dataset.date);
          
          if (type === 'checkin') {
            checkinDate = date;
            checkoutDate = null; // Reset checkout
            document.getElementById('checkin-display').textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            document.getElementById('checkout-display').textContent = 'Add date';
            
            // Update calendars BEFORE closing
            renderCalendar('checkin');
            renderCalendar('checkout');
            
            // Close the calendar
            document.getElementById('checkin-popup').classList.remove('active');
          } else {
            if (!checkinDate || date <= checkinDate) {
              alert('Checkout date must be after check-in date');
              return;
            }
            checkoutDate = date;
            document.getElementById('checkout-display').textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            // Update calendars BEFORE closing
            renderCalendar('checkin');
            renderCalendar('checkout');
            
            // Close the calendar
            document.getElementById('checkout-popup').classList.remove('active');
          }
        });
      });
    }
    
    // Check-In Calendar
    const checkinField = document.getElementById('checkin-field');
    const checkinPopup = document.getElementById('checkin-popup');
    
    checkinField.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.date-picker-popup, .guest-picker-popup, .location-dropdown').forEach(p => p.classList.remove('active'));
      checkinPopup.classList.add('active');
      renderCalendar('checkin');
    });
    
    document.getElementById('checkin-prev').addEventListener('click', function(e) {
      e.stopPropagation();
      currentCheckinMonth.setMonth(currentCheckinMonth.getMonth() - 1);
      renderCalendar('checkin');
    });
    
    document.getElementById('checkin-next').addEventListener('click', function(e) {
      e.stopPropagation();
      currentCheckinMonth.setMonth(currentCheckinMonth.getMonth() + 1);
      renderCalendar('checkin');
    });
    
    // Check-Out Calendar
    const checkoutField = document.getElementById('checkout-field');
    const checkoutPopup = document.getElementById('checkout-popup');
    
    checkoutField.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!checkinDate) {
        alert('Please select check-in date first');
        checkinField.click();
        return;
      }
      document.querySelectorAll('.date-picker-popup, .guest-picker-popup, .location-dropdown').forEach(p => p.classList.remove('active'));
      checkoutPopup.classList.add('active');
      renderCalendar('checkout');
    });
    
    document.getElementById('checkout-prev').addEventListener('click', function(e) {
      e.stopPropagation();
      currentCheckoutMonth.setMonth(currentCheckoutMonth.getMonth() - 1);
      renderCalendar('checkout');
    });
    
    document.getElementById('checkout-next').addEventListener('click', function(e) {
      e.stopPropagation();
      currentCheckoutMonth.setMonth(currentCheckoutMonth.getMonth() + 1);
      renderCalendar('checkout');
    });
    
    // Guest Picker
    const guestsField = document.getElementById('guests-field');
    const guestsPopup = document.getElementById('guests-popup');
    const guestsDisplay = document.getElementById('guests-display');
    const guestCountEl = document.getElementById('guest-count');
    const guestMinus = document.getElementById('guest-minus');
    const guestPlus = document.getElementById('guest-plus');
    
    guestsField.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.date-picker-popup, .guest-picker-popup, .location-dropdown').forEach(p => p.classList.remove('active'));
      guestsPopup.classList.add('active');
    });
    
    guestMinus.addEventListener('click', function(e) {
      e.stopPropagation();
      if (guestCount > 1) {
        guestCount--;
        updateGuestDisplay();
      }
    });
    
    guestPlus.addEventListener('click', function(e) {
      e.stopPropagation();
      if (guestCount < 30) {
        guestCount++;
        updateGuestDisplay();
      }
    });
    
    function updateGuestDisplay() {
      guestCountEl.textContent = guestCount;
      guestsDisplay.value = `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}`;
      guestMinus.disabled = guestCount <= 1;
      guestPlus.disabled = guestCount >= 30;
    }
    
    // Handle Search
    function handleSearch() {
      const location = locationInput.value;
      const checkin = checkinDate ? checkinDate.toISOString().split('T')[0] : '';
      const checkout = checkoutDate ? checkoutDate.toISOString().split('T')[0] : '';
      const guests = guestCount;
      
      // Build query string
      const params = new URLSearchParams();
      if (location) params.append('location', location);
      if (checkin) params.append('checkin', checkin);
      if (checkout) params.append('checkout', checkout);
      params.append('guests', guests);
      
      // Redirect to listings page
      window.location.href = `/listings?${params.toString()}`;
    }
    
    // Initialize
    updateGuestDisplay();
    renderCalendar('checkin');
    renderCalendar('checkout');
