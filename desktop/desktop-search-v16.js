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
  let didCheckAvailability = false; // Track if we checked dates
  let searchLocationCoords = null; // Store search location coordinates
  let actualMinPrice = Infinity;
  let actualMaxPrice = 0;
  
  // Expose to global scope for map-driven filtering
  window.filterState = {
    allProperties: [],
    availablePropertyIds: [],
    didCheckAvailability: false,
    searchLocationCoords: null,
    actualMinPrice: Infinity,
    actualMaxPrice: 0
  };
  
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
    try {
      console.log('Initializing filter system...');
      
      const urlParams = new URLSearchParams(window.location.search);
      const location = urlParams.get('location');
      const checkin = urlParams.get('checkin');
      const checkout = urlParams.get('checkout');
      const guests = urlParams.get('guests');
      
      console.log('URL params:', { location, checkin, checkout, guests });
      
      if (location) {
        document.getElementById('location-input').value = location;
        selectedLocation = { description: location };
        // Get coordinates for radius filtering
        console.log('Getting location coordinates...');
        await getLocationCoordinates(location);
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
      
      console.log('Fetching all properties...');
      await fetchAllProperties();
      
      // Get location coordinates first if provided
      if (location) {
        console.log('Getting location coordinates...');
        await getLocationCoordinates(location);
      }
      
      // Initialize map-driven filtering (wait for map to load, then center if needed)
      await initMapDrivenFiltering(searchLocationCoords);
      
      // Check availability if dates are provided
      if (checkin && checkout) {
        if (!location) {
          console.warn('Dates without location - showing error');
          showError('Please enter a destination to search by dates');
        } else {
          console.log('Has dates + location - checking availability...');
          await checkAvailability(checkin, checkout, guests || '2');
          // After availability check, update cards from map
          if (window.updateCardsFromMap) {
            window.updateCardsFromMap();
          }
        }
      }
      
      console.log('Setting up UI...');
      setupPriceSliders();
      buildPropertyTypeFilter();
      setupEventListeners();
      
      console.log('Filter system ready!');
    } catch (error) {
      console.error('Init failed:', error);
    }
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
      window.filterState.allProperties = allProperties;
      
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
      const resultsCountEl = document.getElementById('results-count');
      if (resultsCountEl) {
        resultsCountEl.textContent = 'Checking availability...';
      }
      
      console.log('Checking availability:', { checkin, checkout, guests });
      
      // Show loading spinners on all cards
      showCardLoadingState(true);
      
      // Build API URL with location coordinates if available
      let apiUrl = `${WORKER_URL}/api/search?checkin=${checkin}&checkout=${checkout}&guests=${guests}`;
      
      if (searchLocationCoords) {
        apiUrl += `&lat=${searchLocationCoords.lat}&lng=${searchLocationCoords.lng}`;
        console.log('Filtering by location:', searchLocationCoords);
      }
      
      // Call Worker to get available property IDs
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      availablePropertyIds = data.available || [];
      didCheckAvailability = true;
      
      // Sync to global state
      window.filterState.availablePropertyIds = availablePropertyIds;
      window.filterState.didCheckAvailability = true;
      
      console.log(`✅ Worker returned ${availablePropertyIds.length} available properties:`, availablePropertyIds);
      
      const el = document.getElementById('results-count'); if (el) el.textContent = 
        `Found ${availablePropertyIds.length} available properties`;
      
      // Hide loading spinners
      showCardLoadingState(false);
      
    } catch (error) {
      console.error('❌ Availability check failed:', error);
      availablePropertyIds = [];
      didCheckAvailability = true;
      
      // Hide loading spinners on error
      showCardLoadingState(false);
      
      const el = document.getElementById('results-count'); if (el) el.textContent = 'Failed to check availability';
    }
  }
  
  async function getLocationCoordinates(locationText) {
    try {
      // First get place_id from autocomplete
      const autocompleteResponse = await fetch(
        `${WORKER_URL}/api/places/autocomplete?input=${encodeURIComponent(locationText)}`
      );
      const autocompleteData = await autocompleteResponse.json();
      
      if (!autocompleteData.predictions || autocompleteData.predictions.length === 0) {
        console.log('No location match found');
        return;
      }
      
      const placeId = autocompleteData.predictions[0].place_id;
      
      // Get coordinates from place details
      const detailsResponse = await fetch(
        `${WORKER_URL}/api/places/details?place_id=${placeId}`
      );
      const detailsData = await detailsResponse.json();
      
      if (detailsData.result && detailsData.result.geometry) {
        searchLocationCoords = {
          lat: detailsData.result.geometry.location.lat,
          lng: detailsData.result.geometry.location.lng
        };
        console.log('Search location coords:', searchLocationCoords);
      }
    } catch (error) {
      console.error('Failed to get location coordinates:', error);
    }
  }
  
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in miles
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
    
    const RADIUS_MILES = 30;
    
    return allProperties.filter(function(property) {
      // Location filtering - if we have location but didn't check availability (location-only search)
      if (searchLocationCoords && !didCheckAvailability && property.latitude && property.longitude) {
        const distance = calculateDistance(
          searchLocationCoords.lat,
          searchLocationCoords.lng,
          property.latitude,
          property.longitude
        );
        if (distance > RADIUS_MILES) {
          return false;
        }
      }
      
      // Availability check - only apply if we checked dates
      if (didCheckAvailability) {
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
    // Map-driven approach: just update the map view
    if (window.updateCardsFromMap) {
      window.updateCardsFromMap();
    }
    
    document.getElementById('filter-dropdown').classList.remove('active');
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
    const el = document.getElementById('results-count'); if (el) el.textContent = 
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
    
    // Validate location is required
    if (!location || location.trim() === '') {
      showError('Please enter a destination');
      return;
    }
    
    // Fix date conversion - use local timezone, not UTC
    let checkin = '';
    let checkout = '';
    
    if (checkinDate) {
      const year = checkinDate.getFullYear();
      const month = String(checkinDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkinDate.getDate()).padStart(2, '0');
      checkin = `${year}-${month}-${day}`;
    }
    
    if (checkoutDate) {
      const year = checkoutDate.getFullYear();
      const month = String(checkoutDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkoutDate.getDate()).padStart(2, '0');
      checkout = `${year}-${month}-${day}`;
    }
    
    const guests = guestCount;
    
    const params = new URLSearchParams();
    params.append('location', location); // Location is now always included
    if (checkin) params.append('checkin', checkin);
    if (checkout) params.append('checkout', checkout);
    params.append('guests', guests);
    
    window.location.href = `/listings?${params.toString()}`;
  }
  
  function showError(message) {
    // Create or get error element
    let errorEl = document.getElementById('search-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'search-error';
      errorEl.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
      document.body.appendChild(errorEl);
    }
    
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    
    setTimeout(() => {
      errorEl.style.display = 'none';
    }, 3000);
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
// MAP-DRIVEN FILTERING (Airbnb style)
// Add this to your existing desktop-search-v3.js

// Wait for map to be ready
function waitForMap() {
  console.log('⏳ Waiting for map to load...');
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds timeout
    
    const checkMap = setInterval(() => {
      attempts++;
      
      if (window.mapInstance && window.mapMarkers) {
        console.log('✅ Map found after', attempts * 100, 'ms');
        clearInterval(checkMap);
        resolve();
      } else if (attempts >= maxAttempts) {
        console.error('❌ Map not found after 10 seconds');
        console.log('window.mapInstance:', window.mapInstance);
        console.log('window.mapMarkers:', window.mapMarkers);
        clearInterval(checkMap);
        reject(new Error('Map timeout'));
      }
    }, 100);
  });
}

async function initMapDrivenFiltering(searchCoords) {
  try {
    await waitForMap();
    
    const map = window.mapInstance;
    const allCards = document.querySelectorAll('[data-listings-id]');
    
    console.log('🗺️ Map-driven filtering initialized with', allCards.length, 'cards');
    
    // Center map on search location if provided
    if (searchCoords && searchCoords.lat && searchCoords.lng) {
      console.log('🗺️ Centering map on search location:', searchCoords);
      map.setView([searchCoords.lat, searchCoords.lng], 10);
    }
  
  
  // Function to update cards based on map bounds
  function updateCardsFromMapBounds() {
    console.log('🔄 updateCardsFromMapBounds called');
    
    const bounds = map.getBounds();
    console.log('📍 Map bounds:', bounds);
    
    let visibleCount = 0;
    
    const filterState = window.filterState || {};
    const availableIds = filterState.availablePropertyIds || [];
    const didCheck = filterState.didCheckAvailability || false;
    
    console.log('Filter state:', { didCheck, availableIdsCount: availableIds.length });
    
    allCards.forEach(card => {
      const lat = parseFloat(card.getAttribute('data-lat'));
      const lng = parseFloat(card.getAttribute('data-lng'));
      const listingId = card.getAttribute('data-listings-id');
      
      if (isNaN(lat) || isNaN(lng)) {
        card.style.display = 'none';
        return;
      }
      
      // Check if property is within map bounds
      const isInBounds = bounds.contains([lat, lng]);
      
      // Apply availability filter if dates were searched
      let isAvailable = true;
      if (didCheck && availableIds.length > 0) {
        isAvailable = availableIds.includes(parseInt(listingId));
      }
      
      // Apply other filters (price, type, amenities)
      const passesFilters = passesOtherFilters(card);
      
      // Show card if in bounds AND available AND passes filters
      if (isInBounds && isAvailable && passesFilters) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });
    
    console.log(`🗺️ Showing ${visibleCount} properties in current map view`);
    updateResultsCount(visibleCount);
    
    // If no properties found, try zooming out to find nearest ones
    if (visibleCount === 0 && allCards.length > 0) {
      console.log('🔍 No properties in view, searching for nearest...');
      findAndShowNearestProperties(map, allCards);
    }
    
    // Show empty state if still no results
    showEmptyState(visibleCount === 0);
    
    // Update markers on map
    updateMapMarkersVisibility();
  }
  
  // Function to check other filters (price, type, amenities)
  function passesOtherFilters(card) {
    const listingId = parseInt(card.getAttribute('data-listings-id'));
    const allProps = window.filterState.allProperties || [];
    const property = allProps.find(p => parseInt(p.listingId) === listingId);
    
    if (!property) return true;
    
    // Price filter
    const priceMin = parseInt(document.getElementById('price-min-slider').value);
    const priceMax = parseInt(document.getElementById('price-max-slider').value);
    if (property.priceMin < priceMin || property.priceMax > priceMax) {
      return false;
    }
    
    // Property type filter
    const selectedTypes = Array.from(document.querySelectorAll('.property-type-pill.active'))
      .map(pill => pill.dataset.type);
    if (selectedTypes.length > 0 && !selectedTypes.includes(property.propertyType)) {
      return false;
    }
    
    // Amenities filters
    const petsRequired = document.getElementById('pets-toggle').classList.contains('active');
    const smokingRequired = document.getElementById('smoking-toggle').classList.contains('active');
    
    if (petsRequired && !property.petsAllowed) return false;
    if (smokingRequired && !property.smokingAllowed) return false;
    
    return true;
  }
  
  // Update map markers visibility based on filters
  function updateMapMarkersVisibility() {
    const filterState = window.filterState || {};
    const availableIds = filterState.availablePropertyIds || [];
    const didCheck = filterState.didCheckAvailability || false;
    const allProps = filterState.allProperties || [];
    
    window.mapMarkers.forEach(marker => {
      const markerListingId = marker.options.listingId;
      
      // Check availability
      let isAvailable = true;
      if (didCheck && availableIds.length > 0) {
        isAvailable = availableIds.includes(parseInt(markerListingId));
      }
      
      // Check other filters
      const property = allProps.find(p => parseInt(p.listingId) === parseInt(markerListingId));
      const passesFilters = property ? passesOtherFilters(document.querySelector(`[data-listings-id="${markerListingId}"]`)) : true;
      
      // Show/hide marker
      if (isAvailable && passesFilters) {
        if (!map.hasLayer(marker)) {
          marker.addTo(map);
        }
      } else {
        if (map.hasLayer(marker)) {
          map.removeLayer(marker);
        }
      }
    });
  }
  
  // Listen to map movement events
  map.on('moveend', updateCardsFromMapBounds);
  map.on('zoomend', updateCardsFromMapBounds);
  
  // Initial update
  setTimeout(updateCardsFromMapBounds, 500);
  
  // Expose function globally for filter updates
  window.updateCardsFromMap = updateCardsFromMapBounds;
  
  } catch (error) {
    console.error('Map initialization failed:', error);
    // Fallback: show all cards if map doesn't load
    document.querySelectorAll('[data-listings-id]').forEach(card => {
      card.style.display = '';
    });
  }
}

// Function to center map on search location
function centerMapOnLocation(lat, lng, zoom = 12) {
  if (window.mapInstance) {
    window.mapInstance.setView([lat, lng], zoom);
    console.log(`🗺️ Map centered on: ${lat}, ${lng}`);
  }
}

// Update results count display
function updateResultsCount(count) {
  const el = document.getElementById('results-count');
  if (el) {
    el.textContent = `${count} properties`;
  }
}

// Show/hide loading state on property cards
function showCardLoadingState(show) {
  const allCards = document.querySelectorAll('[data-listings-id]');
  console.log(`${show ? '🔄 Showing' : '✅ Hiding'} loading spinners on ${allCards.length} cards`);
  
  allCards.forEach(card => {
    let spinner = card.querySelector('.card-loading-spinner');
    
    if (show) {
      if (!spinner) {
        // Create spinner overlay
        spinner = document.createElement('div');
        spinner.className = 'card-loading-spinner';
        spinner.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          border-radius: inherit;
        `;
        
        spinner.innerHTML = `
          <div style="
            width: 32px;
            height: 32px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #222;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          "></div>
          <style>
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        `;
        
        // Make sure card has position relative
        const cardPosition = window.getComputedStyle(card).position;
        if (cardPosition === 'static') {
          card.style.position = 'relative';
        }
        
        card.appendChild(spinner);
      }
      spinner.style.display = 'flex';
    } else {
      if (spinner) {
        spinner.style.display = 'none';
      }
    }
  });
}

// Find and zoom to show nearest properties
function findAndShowNearestProperties(map, allCards) {
  const mapCenter = map.getCenter();
  const filterState = window.filterState || {};
  const availableIds = filterState.availablePropertyIds || [];
  const didCheck = filterState.didCheckAvailability || false;
  
  // Get all valid property locations with distances
  const propertiesWithDistance = [];
  
  allCards.forEach(card => {
    const lat = parseFloat(card.getAttribute('data-lat'));
    const lng = parseFloat(card.getAttribute('data-lng'));
    const listingId = card.getAttribute('data-listings-id');
    
    if (isNaN(lat) || isNaN(lng)) return;
    
    // Check if property is available (if dates were searched)
    if (didCheck && availableIds.length > 0) {
      if (!availableIds.includes(parseInt(listingId))) return;
    }
    
    // Calculate distance from map center
    const distance = map.distance([lat, lng], mapCenter);
    
    propertiesWithDistance.push({
      lat,
      lng,
      distance,
      listingId
    });
  });
  
  if (propertiesWithDistance.length === 0) {
    console.log('❌ No properties found anywhere');
    return;
  }
  
  // Sort by distance and get nearest properties
  propertiesWithDistance.sort((a, b) => a.distance - b.distance);
  
  // Get nearest 5-10 properties
  const nearestProperties = propertiesWithDistance.slice(0, Math.min(10, propertiesWithDistance.length));
  
  console.log(`📍 Found ${nearestProperties.length} nearest properties`);
  
  // Create bounds that include all nearest properties
  const bounds = L.latLngBounds(nearestProperties.map(p => [p.lat, p.lng]));
  
  // Fit map to show these properties with some padding
  map.fitBounds(bounds, { 
    padding: [50, 50],
    maxZoom: 11 // Don't zoom in too much
  });
}

// Show/hide empty state message
function showEmptyState(show) {
  let emptyState = document.getElementById('empty-state-message');
  
  if (show) {
    if (!emptyState) {
      // Create empty state element
      emptyState = document.createElement('div');
      emptyState.id = 'empty-state-message';
      emptyState.style.cssText = `
        padding: 60px 20px;
        text-align: center;
        font-family: 'Manrope', -apple-system, sans-serif;
        max-width: 500px;
        margin: 40px auto;
      `;
      
      emptyState.innerHTML = `
        <div style="font-size: 24px; font-weight: 600; color: #222; margin-bottom: 12px;">
          No exact matches
        </div>
        <div style="font-size: 16px; color: #717171; margin-bottom: 24px; line-height: 1.5;">
          Try adjusting your search. Changing your dates or zooming out on the map might open up more options.
        </div>
        <div style="font-size: 14px; color: #222; font-weight: 500;">
          Suggestions:
        </div>
        <ul style="list-style: none; padding: 0; margin: 16px 0 0 0; font-size: 14px; color: #717171; text-align: left; display: inline-block;">
          <li style="margin-bottom: 8px;">• Zoom out on the map to see more properties</li>
          <li style="margin-bottom: 8px;">• Try different dates</li>
          <li style="margin-bottom: 8px;">• Remove some filters</li>
          <li>• Search a nearby city or region</li>
        </ul>
      `;
      
      // Insert after property cards container
      const cardsContainer = document.querySelector('.collection-list, [data-listings-id]')?.parentElement;
      if (cardsContainer) {
        cardsContainer.appendChild(emptyState);
      }
    }
    emptyState.style.display = 'block';
  } else {
    if (emptyState) {
      emptyState.style.display = 'none';
    }
  }
}
