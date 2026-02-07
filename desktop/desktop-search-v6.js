// ============================================
// LISTINGS SEARCH + FILTER SYSTEM
// GitHub: desktop-search-v3.js
// ============================================

(function() {
  'use strict';
  
  const WORKER_URL = 'https://hostaway-proxy.triad-sync.workers.dev';
  
  // State
  let allProperties = [];
  let availablePropertyIds = [];
  let actualMinPrice = Infinity;
  let actualMaxPrice = 0;
  
  let debounceTimer = null;
  let selectedLocation = null;
  let guestCount = 2;
  let checkinDate = null;
  let checkoutDate = null;
  let currentCheckinMonth = new Date();
  let currentCheckoutMonth = new Date();
  
  // ============================================
  // INITIALIZATION
  // ============================================
  
  async function init() {
    console.log('Initializing filter system...');
    
    const urlParams = new URLSearchParams(window.location.search);
    const location = urlParams.get('location');
    const checkin = urlParams.get('checkin');
    const checkout = urlParams.get('checkout');
    const guests = urlParams.get('guests');
    
    if (location) {
      document.getElementById('location-input').value = location;
      selectedLocation = { description: location };
    }
    
    if (checkin) {
      checkinDate = new Date(checkin);
      document.getElementById('checkin-display').value = checkinDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    if (checkout) {
      checkoutDate = new Date(checkout);
      document.getElementById('checkout-display').value = checkoutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    if (guests) {
      guestCount = parseInt(guests);
      updateGuestDisplay();
    }
    
    await fetchAllProperties();
    
    if (checkin && checkout) {
      await checkAvailability(checkin, checkout, guests || '2');
    }
    
    setupPriceSliders();
    buildPropertyTypeFilter();
    setupEventListeners();
    updateResultsCount();
    
    // Apply filters automatically if we have search results
    if (checkin && checkout && availablePropertyIds.length >= 0) {
      applyFilters();
    }
    
    console.log('Filter system ready!');
  }
  
  // ============================================
  // FETCH DATA
  // ============================================
  
  async function fetchAllProperties() {
    try {
      const response = await fetch(`${WORKER_URL}/api/webflow/properties`);
      const data = await response.json();
      
      if (!data.properties || data.properties.length === 0) {
        console.error('No properties returned');
        return;
      }
      
      allProperties = data.properties.filter(p => p.isLive);
      
      allProperties.forEach(function(property) {
        if (property.priceMin < actualMinPrice && property.priceMin > 0) {
          actualMinPrice = property.priceMin;
        }
        if (property.priceMax > actualMaxPrice) {
          actualMaxPrice = property.priceMax;
        }
      });
      
      console.log(`Loaded ${allProperties.length} properties, price range: $${actualMinPrice}-$${actualMaxPrice}`);
      
    } catch (error) {
      console.error('Failed to fetch properties:', error);
    }
  }
  
  async function checkAvailability(checkin, checkout, guests) {
    try {
      document.getElementById('results-count').textContent = 'Checking availability...';
      
      const response = await fetch(
        `${WORKER_URL}/api/search?checkin=${checkin}&checkout=${checkout}&guests=${guests}`
      );
      const data = await response.json();
      
      availablePropertyIds = data.available || [];
      console.log(`${availablePropertyIds.length} properties available for dates`);
      
    } catch (error) {
      console.error('Availability check failed:', error);
      availablePropertyIds = [];
    }
  }
  
  // ============================================
  // FILTER LOGIC
  // ============================================
  
  function getFilteredProperties() {
    const priceMin = parseInt(document.getElementById('price-min-slider').value);
    const priceMax = parseInt(document.getElementById('price-max-slider').value);
    
    const selectedTypes = Array.from(document.querySelectorAll('.property-type-pill.active'))
      .map(pill => pill.dataset.type);
    
    const petsRequired = document.getElementById('pets-toggle').classList.contains('active');
    const smokingRequired = document.getElementById('smoking-toggle').classList.contains('active');
    
    return allProperties.filter(function(property) {
      if (availablePropertyIds.length > 0) {
        if (!availablePropertyIds.includes(parseInt(property.listingId))) {
          return false;
        }
      }
      
      if (property.priceMin < priceMin || property.priceMax > priceMax) {
        return false;
      }
      
      if (selectedTypes.length > 0 && !selectedTypes.includes(property.propertyType)) {
        return false;
      }
      
      if (petsRequired && !property.petsAllowed) {
        return false;
      }
      
      if (smokingRequired && !property.smokingAllowed) {
        return false;
      }
      
      return true;
    });
  }
  
  function applyFilters() {
    const filtered = getFilteredProperties();
    
    const cards = document.querySelectorAll('[data-listings-id]');
    const cardMap = {};
    
    cards.forEach(function(card) {
      const id = card.getAttribute('data-listings-id');
      cardMap[id] = card;
    });
    
    cards.forEach(function(card) {
      card.style.display = 'none';
    });
    
    const filteredCards = [];
    filtered.forEach(function(property) {
      const card = cardMap[property.listingId];
      if (card) {
        card.style.display = '';
        filteredCards.push(card);
      }
    });
    
    if (typeof window.updateMapMarkers === 'function') {
      window.updateMapMarkers(filteredCards);
    }
    
    document.getElementById('filter-dropdown').classList.remove('active');
    
    console.log(`Showing ${filtered.length} of ${allProperties.length} properties`);
  }
  
  function clearFilters() {
    document.getElementById('price-min-slider').value = actualMinPrice;
    document.getElementById('price-max-slider').value = actualMaxPrice;
    document.getElementById('price-min-display').textContent = '$' + actualMinPrice;
    document.getElementById('price-max-display').textContent = '$' + actualMaxPrice;
    
    const track = document.getElementById('slider-track');
    track.style.left = '0%';
    track.style.width = '100%';
    
    document.querySelectorAll('.property-type-pill').forEach(function(pill) {
      pill.classList.remove('active');
    });
    
    document.getElementById('pets-toggle').classList.remove('active');
    document.getElementById('smoking-toggle').classList.remove('active');
    
    updateResultsCount();
  }
  
  function updateResultsCount() {
    const count = getFilteredProperties().length;
    document.getElementById('results-count').textContent = 
      count === allProperties.length ? 
      'Showing all properties' : 
      `Showing ${count} of ${allProperties.length} properties`;
  }
  
  // ============================================
  // PRICE SLIDERS
  // ============================================
  
  function setupPriceSliders() {
    const minSlider = document.getElementById('price-min-slider');
    const maxSlider = document.getElementById('price-max-slider');
    const minDisplay = document.getElementById('price-min-display');
    const maxDisplay = document.getElementById('price-max-display');
    const track = document.getElementById('slider-track');
    
    minSlider.min = actualMinPrice;
    minSlider.max = actualMaxPrice;
    minSlider.value = actualMinPrice;
    
    maxSlider.min = actualMinPrice;
    maxSlider.max = actualMaxPrice;
    maxSlider.value = actualMaxPrice;
    
    minDisplay.textContent = '$' + actualMinPrice;
    maxDisplay.textContent = '$' + actualMaxPrice;
    
    function updateSlider() {
      let minVal = parseInt(minSlider.value);
      let maxVal = parseInt(maxSlider.value);
      
      if (minVal >= maxVal) {
        if (this === minSlider) {
          maxSlider.value = minVal + 1;
          maxVal = minVal + 1;
        } else {
          minSlider.value = maxVal - 1;
          minVal = maxVal - 1;
        }
      }
      
      minDisplay.textContent = '$' + minVal;
      maxDisplay.textContent = '$' + maxVal;
      
      const percentMin = ((minVal - actualMinPrice) / (actualMaxPrice - actualMinPrice)) * 100;
      const percentMax = ((maxVal - actualMinPrice) / (actualMaxPrice - actualMinPrice)) * 100;
      
      track.style.left = percentMin + '%';
      track.style.width = (percentMax - percentMin) + '%';
      
      updateResultsCount();
    }
    
    minSlider.addEventListener('input', updateSlider);
    maxSlider.addEventListener('input', updateSlider);
    
    updateSlider.call(minSlider);
  }
  
  // ============================================
  // PROPERTY TYPES
  // ============================================
  
  function buildPropertyTypeFilter() {
    const typesContainer = document.getElementById('property-types');
    const uniqueTypes = [...new Set(allProperties.map(p => p.propertyType).filter(t => t))];
    
    typesContainer.innerHTML = '';
    uniqueTypes.forEach(function(type) {
      const pill = document.createElement('div');
      pill.className = 'property-type-pill';
      pill.textContent = type;
      pill.dataset.type = type;
      
      pill.addEventListener('click', function() {
        this.classList.toggle('active');
        updateResultsCount();
      });
      
      typesContainer.appendChild(pill);
    });
  }
  
  // ============================================
  // EVENT LISTENERS
  // ============================================
  
  function setupEventListeners() {
    document.getElementById('filter-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('filter-dropdown').classList.toggle('active');
    });
    
    document.addEventListener('click', function(e) {
      const dropdown = document.getElementById('filter-dropdown');
      const filterBtn = document.getElementById('filter-btn');
      
      if (!dropdown.contains(e.target) && !filterBtn.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
    
    document.getElementById('pets-toggle').addEventListener('click', function() {
      this.classList.toggle('active');
      updateResultsCount();
    });
    
    document.getElementById('smoking-toggle').addEventListener('click', function() {
      this.classList.toggle('active');
      updateResultsCount();
    });
    
    document.getElementById('filter-clear').addEventListener('click', clearFilters);
    document.getElementById('filter-apply').addEventListener('click', applyFilters);
    
    document.getElementById('search-btn').addEventListener('click', handleSearch);
    
    setupSearchBar();
  }
  
  // ============================================
  // SEARCH BAR
  // ============================================
  
  function setupSearchBar() {
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.search-field')) {
        document.querySelectorAll('.location-dropdown, .date-picker-popup, .guest-picker-popup').forEach(popup => {
          popup.classList.remove('active');
        });
      }
    });
    
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
    
    setupCalendar('checkin');
    setupCalendar('checkout');
    setupGuests();
    
    updateGuestDisplay();
    renderCalendar('checkin');
    renderCalendar('checkout');
  }
  
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
    const locationDropdown = document.getElementById('location-dropdown');
    locationDropdown.innerHTML = predictions.map(p => 
      `<div class="location-dropdown-item" data-place-id="${p.place_id}">${p.description}</div>`
    ).join('');
    
    locationDropdown.classList.add('active');
    
    locationDropdown.querySelectorAll('.location-dropdown-item').forEach(item => {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        document.getElementById('location-input').value = this.textContent;
        selectedLocation = {
          description: this.textContent,
          place_id: this.dataset.placeId
        };
        locationDropdown.classList.remove('active');
      });
    });
  }
  
  function setupCalendar(type) {
    const field = document.getElementById(`${type}-field`);
    const popup = document.getElementById(`${type}-popup`);
    
    field.addEventListener('click', function(e) {
      e.stopPropagation();
      if (type === 'checkout' && !checkinDate) {
        alert('Please select check-in date first');
        return;
      }
      document.querySelectorAll('.date-picker-popup, .guest-picker-popup, .location-dropdown').forEach(p => p.classList.remove('active'));
      popup.classList.add('active');
      renderCalendar(type);
    });
    
    document.getElementById(`${type}-prev`).addEventListener('click', function(e) {
      e.stopPropagation();
      if (type === 'checkin') {
        currentCheckinMonth.setMonth(currentCheckinMonth.getMonth() - 1);
      } else {
        currentCheckoutMonth.setMonth(currentCheckoutMonth.getMonth() - 1);
      }
      renderCalendar(type);
    });
    
    document.getElementById(`${type}-next`).addEventListener('click', function(e) {
      e.stopPropagation();
      if (type === 'checkin') {
        currentCheckinMonth.setMonth(currentCheckinMonth.getMonth() + 1);
      } else {
        currentCheckoutMonth.setMonth(currentCheckoutMonth.getMonth() + 1);
      }
      renderCalendar(type);
    });
  }
  
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
    
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="calendar-day empty"></div>';
    }
    
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
    
    daysContainer.querySelectorAll('.calendar-day.available').forEach(dayEl => {
      dayEl.addEventListener('click', function(e) {
        e.stopPropagation();
        const date = new Date(this.dataset.date);
        
        if (type === 'checkin') {
          checkinDate = date;
          checkoutDate = null;
          document.getElementById('checkin-display').value = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          document.getElementById('checkout-display').value = 'Add date';
          
          renderCalendar('checkin');
          renderCalendar('checkout');
          
          document.getElementById('checkin-popup').classList.remove('active');
        } else {
          if (!checkinDate || date <= checkinDate) {
            alert('Checkout date must be after check-in date');
            return;
          }
          checkoutDate = date;
          document.getElementById('checkout-display').value = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          renderCalendar('checkin');
          renderCalendar('checkout');
          
          document.getElementById('checkout-popup').classList.remove('active');
        }
      });
    });
  }
  
  function setupGuests() {
    const guestsField = document.getElementById('guests-field');
    const guestsPopup = document.getElementById('guests-popup');
    
    guestsField.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.date-picker-popup, .location-dropdown').forEach(p => p.classList.remove('active'));
      guestsPopup.classList.add('active');
    });
    
    document.getElementById('guest-minus').addEventListener('click', function(e) {
      e.stopPropagation();
      if (guestCount > 1) {
        guestCount--;
        updateGuestDisplay();
      }
    });
    
    document.getElementById('guest-plus').addEventListener('click', function(e) {
      e.stopPropagation();
      if (guestCount < 30) {
        guestCount++;
        updateGuestDisplay();
      }
    });
  }
  
  function updateGuestDisplay() {
    document.getElementById('guest-count').textContent = guestCount;
    document.getElementById('guests-display').value = `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}`;
  }
  
  async function handleSearch() {
    const location = document.getElementById('location-input').value;
    const checkin = checkinDate ? checkinDate.toISOString().split('T')[0] : '';
    const checkout = checkoutDate ? checkoutDate.toISOString().split('T')[0] : '';
    const guests = guestCount;
    
    const params = new URLSearchParams();
    if (location) params.append('location', location);
    if (checkin) params.append('checkin', checkin);
    if (checkout) params.append('checkout', checkout);
    params.append('guests', guests);
    
    window.location.href = `/listings?${params.toString()}`;
  }
  
  // ============================================
  // MAP INTEGRATION
  // ============================================
  
  window.updateMapMarkers = function(filteredCards) {
    if (!window.mapInstance || !window.mapMarkers) return;
    
    window.mapMarkers.forEach(function(marker) {
      marker.remove();
    });
    
    const filteredIds = filteredCards.map(function(card) {
      return card.getAttribute('data-listings-id');
    });
    
    const bounds = new L.LatLngBounds();
    let visibleCount = 0;
    
    window.mapMarkers.forEach(function(marker) {
      const markerId = marker.options.listingId;
      
      if (filteredIds.includes(String(markerId))) {
        marker.addTo(window.mapInstance);
        bounds.extend(marker.getLatLng());
        visibleCount++;
      }
    });
    
    if (visibleCount > 0 && bounds.isValid()) {
      window.mapInstance.fitBounds(bounds.pad(0.1));
    }
  };
  
  // ============================================
  // START
  // ============================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
