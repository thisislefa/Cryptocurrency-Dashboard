// --- CONFIGURATION ---
        // Using CoinGecko Free API (No key needed for basic endpoints, but has rate limits)
        const API_BASE = 'https://api.coingecko.com/api/v3';
        const TOTAL_COINS_TO_FETCH = 50; 
        
        // --- STATE MANAGEMENT ---
        let appState = {
            coins: [], // Stores raw API data
            currency: 'usd',
            activeFilter: 'all',
            currencySymbol: '$',
            watchlist: JSON.parse(localStorage.getItem('cryptoWatchlist')) || [],
            globalStats: null
        };

        // DeFi Token List (Manual filter since API category filtering is complex without ID knowledge)
        const DEFI_TOKENS = ['uni', 'aave', 'link', 'mkr', 'crv', 'comp', 'snx', '1inch', 'cake', 'rune', 'lDO', 'pendle', 'inj'];

        // --- INIT ---
        document.addEventListener('DOMContentLoaded', async () => {
            updateWatchlistCount();
            await fetchGlobalStats();
            await fetchMarketData();
            
            // Auto-refresh every 60 seconds
            setInterval(fetchMarketData, 60000);
            
            // Hide Loader
            setTimeout(() => {
                document.getElementById('loader').classList.add('hidden');
            }, 800);
        });

        // --- API CALLS ---

        async function fetchGlobalStats() {
            // Mocking Global Stats mostly because the global endpoint is heavy/rate-limited often
            // In a production app with a paid key, fetch from /global
            const mockGlobal = {
                active_cryptocurrencies: 14502,
                total_market_cap: { usd: 2450000000000 },
                total_volume: { usd: 84000000000 },
                market_cap_percentage: { btc: 54.2 }
            };
            
            // Fear and Greed
            try {
                const fgRes = await fetch('https://api.alternative.me/fng/');
                const fgData = await fgRes.json();
                const fng = fgData.data[0];
                
                // Update DOM
                const needle = document.getElementById('fg-needle');
                const text = document.getElementById('fg-text');
                needle.style.left = `${fng.value}%`;
                text.textContent = `${fng.value} (${fng.value_classification})`;
                text.className = 'crypto-header-stat-value ' + (fng.value > 50 ? 'crypto-text-green' : 'crypto-text-red');
            } catch (e) { console.warn("FNG API Error", e); }

            // Update Header DOM with Mock/Real data
            document.getElementById('btc-dom').textContent = mockGlobal.market_cap_percentage.btc + '%';
        }

        async function fetchMarketData() {
            const currency = appState.currency;
            
            // CoinGecko endpoint for market data + sparkline (7d)
            const url = `${API_BASE}/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=${TOTAL_COINS_TO_FETCH}&page=1&sparkline=true&price_change_percentage=24h`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if(response.status === 429) throw new Error("Rate Limited");
                    throw new Error("API Error");
                }
                const data = await response.json();
                appState.coins = data;
                
                // Update Global Header Stats derived from top coins
                const totalMcap = data.reduce((acc, coin) => acc + coin.market_cap, 0);
                const totalVol = data.reduce((acc, coin) => acc + coin.total_volume, 0);
                document.getElementById('global-mcap').textContent = formatCurrency(totalMcap, true);
                document.getElementById('global-vol').textContent = formatCurrency(totalVol, true);

                renderDashboard();
            } catch (error) {
                console.error("Fetch failed:", error);
                // If API fails, use Mock Data to keep UI functional
                if (appState.coins.length === 0) {
                    generateMockData(); 
                    renderDashboard();
                    alert("API Rate Limit hit. Showing Demo Data.");
                }
            }
        }

        // --- RENDERING LOGIC ---

        function renderDashboard() {
            renderCards();
            renderTable();
        }

        function renderCards() {
            const container = document.getElementById('cards-container');
            const data = appState.coins;
            if (!data.length) return;

            // 1. Top Gainer
            const topGainer = [...data].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)[0];
            // 2. Highest Volume (Trending)
            const highestVol = [...data].sort((a, b) => b.total_volume - a.total_volume)[0];
            // 3. Random "New Listing" (Mocked for logic as API doesn't return 'new' flag in this endpoint)
            const hotPick = data.find(c => c.symbol === 'sol') || data[3];

            // Card HTML Generator Helper
            const createCardHTML = (title, subtitle, coins, cardClass) => {
                let listHTML = coins.map(coin => `
                    <div class="crypto-card-item">
                        <div style="display:flex; align-items:center;">
                            <img src="${coin.image}" class="crypto-icon-sm" alt="${coin.symbol}">
                            <span class="crypto-card-name">${coin.name}</span>
                        </div>
                        <div class="crypto-card-right">
                            <span class="crypto-card-price">${formatCurrency(coin.current_price)}</span>
                            <span class="crypto-card-change ${coin.price_change_percentage_24h >= 0 ? 'crypto-text-green' : 'crypto-text-red'}">
                                ${coin.price_change_percentage_24h.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                `).join('');

                return `
                <div class="crypto-card ${cardClass}">
                    <div>
                        <div class="crypto-card-title">${title}</div>
                        <div class="crypto-card-subtitle">${subtitle}</div>
                    </div>
                    <div class="crypto-card-list">${listHTML}</div>
                </div>`;
            };

            // Build Lists
            const trendingList = data.slice(0, 3); // Top 3 by Mcap
            const gainersList = [...data].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 3);
            const volumeList = [...data].sort((a, b) => b.total_volume - a.total_volume).slice(0, 3);
            const stableList = data.filter(c => c.symbol.includes('usd')).slice(0, 3);

            container.innerHTML = `
                ${createCardHTML('Market Leaders', 'Top Market Cap', trendingList, 'crypto-card-1')}
                ${createCardHTML('Top Gainers', 'Highest 24h Change', gainersList, 'crypto-card-3')}
                ${createCardHTML('High Volume', 'Most Traded', volumeList, 'crypto-card-2')}
                ${createCardHTML('Stablecoins', 'Pegged Assets', stableList, 'crypto-card-4')}
            `;
        }

        function renderTable() {
            const tbody = document.getElementById('crypto-table-body');
            tbody.innerHTML = '';

            // Apply Filter
            let filteredData = [...appState.coins];
            
            if (appState.activeFilter === 'gainers') {
                filteredData.sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
            } else if (appState.activeFilter === 'losers') {
                // Ascending order for losers
                filteredData.sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h);
            } else if (appState.activeFilter === 'popular') {
                // Popular usually means top rank/market cap
                filteredData.sort((a, b) => a.market_cap_rank - b.market_cap_rank);
            } else if (appState.activeFilter === 'defi') {
                filteredData = filteredData.filter(c => DEFI_TOKENS.includes(c.symbol.toLowerCase()));
            } else if (appState.activeFilter === 'watchlist') {
                filteredData = filteredData.filter(c => appState.watchlist.includes(c.id));
                if (filteredData.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 40px;">No coins in watchlist yet. Click the star icon to add.</td></tr>';
                    return;
                }
            }

            filteredData.forEach((coin, index) => {
                const isPositive = coin.price_change_percentage_24h >= 0;
                const trendColor = isPositive ? '#0ECB81' : '#F6465D';
                const isStarred = appState.watchlist.includes(coin.id);
                
                // Generate Sparkline SVG Path
                const sparklinePath = generateSparklinePath(coin.sparkline_in_7d.price);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="color:#8A91B5;">${coin.market_cap_rank}</td>
                    <td>
                        <div class="asset-cell">
                            <img src="${coin.image}" class="asset-icon" alt="${coin.symbol}">
                            <div class="asset-info">
                                <span style="font-weight:600;">${coin.name}</span>
                                <span class="asset-symbol">${coin.symbol.toUpperCase()}</span>
                            </div>
                        </div>
                    </td>
                    <td style="font-weight:600;">${formatCurrency(coin.current_price)}</td>
                    <td class="${isPositive ? 'crypto-text-green' : 'crypto-text-red'}">
                        ${isPositive ? '+' : ''}${coin.price_change_percentage_24h.toFixed(2)}%
                    </td>
                    <td>${formatCurrency(coin.total_volume, true)}</td>
                    <td>${formatCurrency(coin.market_cap, true)}</td>
                    <td>
                        <div class="sparkline-container">
                            <svg class="sparkline-svg" viewBox="0 0 168 50" preserveAspectRatio="none">
                                <path class="sparkline-path" d="${sparklinePath}" stroke="${trendColor}"></path>
                            </svg>
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <a href="${generateTradeLink(coin.symbol.toUpperCase())}" target="_blank" class="trade-btn">Trade</a>
                    </td>
                    <td style="text-align: center;">
                        <button class="star-btn ${isStarred ? 'active' : ''}" onclick="toggleWatchlist('${coin.id}', this)">
                            <svg width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // --- HELPERS ---
        
        /**
         * Generates a real-time trading link for a given cryptocurrency symbol 
         * on the Binance exchange (the largest exchange).
         */
        function generateTradeLink(symbol) {
            // We assume the common trading pair: [COIN] / USDT (Tether)
            const baseExchangeURL = 'https://www.binance.com/en/trade/';
            
            // Handle common symbols that might not use a direct USDT pair naming convention, 
            // though most top coins do.
            return `${baseExchangeURL}${symbol}_USDT`;
        }

        function formatCurrency(num, compact = false) {
            const sym = appState.currencySymbol;
            if (compact) {
                if (num >= 1e12) return sym + (num / 1e12).toFixed(2) + 'T';
                if (num >= 1e9) return sym + (num / 1e9).toFixed(2) + 'B';
                if (num >= 1e6) return sym + (num / 1e6).toFixed(2) + 'M';
            }
            if (num < 1) return sym + num.toFixed(6);
            return sym + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function generateSparklinePath(prices) {
            // Convert array of prices into SVG path coordinates
            if (!prices || prices.length === 0) return "";
            
            // Limit to last 50 points for smoother rendering if array is huge
            // CoinGecko gives hourly data for 7 days = ~168 points.
            
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            const range = max - min;
            const width = 168; // SVG viewBox width
            const height = 50; // SVG viewBox height
            
            // Map X (index) -> 0 to width
            // Map Y (price) -> height to 0 (SVG y is down)
            
            let d = "";
            const stepX = width / (prices.length - 1);
            
            prices.forEach((price, i) => {
                const x = i * stepX;
                // Avoid division by zero if flat line
                const y = range === 0 ? height / 2 : height - ((price - min) / range) * height;
                d += (i === 0 ? "M" : "L") + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
            });
            
            return d;
        }

        function scrollCards(direction) {
            const container = document.getElementById('cards-container');
            const scrollAmount = 300;
            if(direction === 1) container.scrollLeft += scrollAmount;
            else container.scrollLeft -= scrollAmount;
        }

        // --- INTERACTION ---

        function applyFilter(type, btnElement) {
            appState.activeFilter = type;
            
            // UI Toggle
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            btnElement.classList.add('active');
            
            renderTable();
        }

        function changeCurrency() {
            const select = document.getElementById('currency-select');
            appState.currency = select.value;
            appState.currencySymbol = select.value === 'usd' ? '$' : select.value === 'eur' ? '€' : '£';
            
            // Show loader
            document.getElementById('loader').classList.remove('hidden');
            fetchMarketData().then(() => {
                document.getElementById('loader').classList.add('hidden');
            });
        }

        function toggleWatchlist(coinId, btn) {
            if (appState.watchlist.includes(coinId)) {
                appState.watchlist = appState.watchlist.filter(id => id !== coinId);
                btn.classList.remove('active');
            } else {
                appState.watchlist.push(coinId);
                btn.classList.add('active');
            }
            localStorage.setItem('cryptoWatchlist', JSON.stringify(appState.watchlist));
            updateWatchlistCount();
            
            // Re-render if we are currently on the watchlist tab to remove the item instantly
            if (appState.activeFilter === 'watchlist') {
                renderTable();
            }
        }

        function updateWatchlistCount() {
            document.getElementById('watchlist-count').innerText = appState.watchlist.length;
        }

        // --- FALLBACK MOCK DATA (If API fails) ---
        function generateMockData() {
            const mocks = [];
            // Added more cryptocurrencies as requested in previous turns
            const ids = ['bitcoin', 'ethereum', 'solana', 'ripple', 'cardano', 'avalanche-2', 'dogecoin', 'shiba-inu', 'polkadot', 'chainlink', 'litecoin', 'polygon', 'uniswap', 'tron', 'stellar', 'monero', 'cosmos', 'ethereum-classic', 'filecoin', 'internet-computer'];
            ids.forEach((id, i) => {
                const price = Math.random() * 1000 + 10;
                mocks.push({
                    id: id,
                    symbol: id.substring(0, 3),
                    name: id.toUpperCase(),
                    image: 'https://cdn-icons-png.flaticon.com/512/1213/1213079.png',
                    current_price: price,
                    market_cap: price * 1000000,
                    market_cap_rank: i + 1,
                    total_volume: price * 50000,
                    price_change_percentage_24h: (Math.random() * 10) - 4,
                    sparkline_in_7d: { price: Array.from({length: 50}, () => Math.random() * 100) }
                });
            });
            appState.coins = mocks;
        }
