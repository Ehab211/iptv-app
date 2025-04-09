// Platform detection
const isTizen = typeof tizen !== 'undefined';
const isWebOS = typeof webOS !== 'undefined';

// Key codes for TV remote
const KEY_CODES = {
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  ENTER: 13,
  BACK: isTizen ? 10009 : isWebOS ? 461 : 27 // Tizen: 10009, webOS: 461, Browser: 27
};

let channels = [];
let currentFocusIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('login-screen');
  const channelScreen = document.getElementById('channel-screen');
  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  const errorOk = document.getElementById('error-ok');
  const loginBtn = document.getElementById('login-btn');
  const focusables = Array.from(document.querySelectorAll('.focusable'));

  // Check if elements exist before proceeding
  if (!loginScreen || !channelScreen || !errorOverlay || !errorMessage || !errorOk || !loginBtn) {
    console.error('Required DOM elements are missing. Check your index.html file.');
    return;
  }

  // Set initial focus
  loginBtn.focus();

  // Show error overlay
  function showError(message) {
    errorMessage.textContent = message;
    errorOverlay.classList.remove('hidden');
    errorOk.focus();
  }

  // Hide error overlay
  errorOk.addEventListener('click', () => {
    errorOverlay.classList.add('hidden');
    focusables[0].focus();
  });

  // Handle TV remote navigation
  document.addEventListener('keydown', (e) => {
    const activeScreen = loginScreen.classList.contains('hidden') ? channelScreen : loginScreen;
    const items = activeScreen.querySelectorAll('.focusable, .channel');
    if (e.keyCode === KEY_CODES.UP || e.keyCode === KEY_CODES.DOWN) {
      e.preventDefault();
      currentFocusIndex = (currentFocusIndex + (e.keyCode === KEY_CODES.UP ? -1 : 1) + items.length) % items.length;
      items[currentFocusIndex].focus();
    } else if (e.keyCode === KEY_CODES.BACK) {
      if (!loginScreen.classList.contains('hidden')) return;
      e.preventDefault();
      channelScreen.classList.add('hidden');
      loginScreen.classList.remove('hidden');
      focusables[0].focus();
      document.getElementById('player').pause();
      document.getElementById('player').classList.add('hidden');
    }
  });

  // Login button click
  loginBtn.addEventListener('click', async () => {
    const url = document.getElementById('url').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      if (!url) {
        throw new Error('Please provide a URL');
      }
      // Check if the URL is for an M3U playlist
      if (url.endsWith('.m3u') || url.includes('type=m3u') || url.includes('type=m3u_plus') || url.includes('.m3u8')) {
        channels = await fetchM3U(url);
      } else if (username && password) {
        channels = await fetchXtreamCodes(url, username, password);
      } else {
        throw new Error('Please provide valid M3U URL or Xtream Codes credentials (username and password)');
      }
      renderChannels();
      loginScreen.classList.add('hidden');
      channelScreen.classList.remove('hidden');
      document.querySelector('.channel').focus();
    } catch (error) {
      showError('Error: ' + error.message);
    }
  });
});

// Fetch and parse M3U playlist
async function fetchM3U(url) {
  const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
  try {
    const response = await fetch(proxyUrl + url, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch M3U playlist: ${response.status} - ${errorText}`);
    }
    const text = await response.text();
    const lines = text.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXTINF')) {
        const name = lines[i].split(',')[1].trim();
        const streamUrl = lines[i + 1].trim();
        result.push({ id: streamUrl, name, url: streamUrl });
        i++;
      }
    }
    return result;
  } catch (error) {
    throw new Error(`Network error while fetching M3U playlist: ${error.message}`);
  }
}

// Fetch Xtream Codes channel list
async function fetchXtreamCodes(server, username, password) {
  const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
  try {
    const response = await fetch(proxyUrl + `${server}/player_api.php?username=${username}&password=${password}&action=get_live_streams`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Xtream Codes channels: ${response.status} - ${errorText}`);
    }
    const streams = await response.json();
    return streams.map(s => ({
      id: s.stream_id,
      name: s.name,
      url: `${server}/live/${username}/${password}/${s.stream_id}.ts`
    }));
  } catch (error) {
    throw new Error(`Network error while fetching Xtream Codes channels: ${error.message}`);
  }
}

// Render channel list
function renderChannels() {
  const channelList = document.getElementById('channel-list');
  channelList.innerHTML = '';
  channels.forEach((channel, index) => {
    const div = document.createElement('div');
    div.className = 'channel';
    div.tabIndex = 0; // Make focusable
    div.textContent = channel.name;
    div.addEventListener('click', () => playChannel(channel.url));
    div.addEventListener('keydown', (e) => {
      if (e.keyCode === KEY_CODES.ENTER) playChannel(channel.url);
    });
    channelList.appendChild(div);
  });
}

// Play selected channel
function playChannel(url) {
  const player = document.getElementById('player');
  player.classList.remove('hidden');
  if (Hls.isSupported() && url.includes('.m3u8')) {
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(player);
    hls.on(Hls.Events.MANIFEST_PARSED, () => player.play());
  } else {
    player.src = url;
    player.play();
  }
}
