import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, AlertCircle, DollarSign, PieChart, Target, Plus, X, RefreshCw, ArrowRight, Clock, ShoppingCart, Shield, AlertTriangle } from 'lucide-react';

const PortfolioManager = () => {
  // État principal
  const [portfolio, setPortfolio] = useState(() => {
    try {
      const saved = localStorage.getItem('portfolioThailand');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [marketData, setMarketData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStock, setNewStock] = useState({ ticker: '', quantity: '', buyPrice: '' });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [cashAvailable, setCashAvailable] = useState(() => {
    const saved = localStorage.getItem('cashAvailable');
    return saved ? parseFloat(saved) : 0;
  });

  // Constantes stratégiques
  const SELL_THRESHOLDS = {
    FIRST: { gain: 0.30, sell: 0.20 },   // +30% → vendre 20%
    SECOND: { gain: 0.60, sell: 0.20 },  // +60% → vendre 20% de plus
    THIRD: { gain: 1.00, sell: 0.10 },   // +100% → vendre 10% de plus
    MAX_SELL: 0.50  // Ne jamais vendre plus de 50% total
  };

  const PROTECTED_STOCKS = ['NVDA', 'MSFT', 'GOOGL', 'AAPL', 'BRK.B'];
  const QUALITY_THRESHOLD = 7; // Score minimum pour acheter
  const MAX_POSITIONS = 12;

  // Sauvegardes automatiques
  useEffect(() => {
    localStorage.setItem('portfolioThailand', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    localStorage.setItem('cashAvailable', cashAvailable.toString());
  }, [cashAvailable]);

  // Fonction pour récupérer les données de marché
  const fetchMarketData = useCallback(async (ticker) => {
    try {
      // Yahoo Finance API
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`
      );
      
      if (!response.ok) {
        throw new Error(`Erreur API pour ${ticker}`);
      }

      const data = await response.json();
      
      if (!data.chart || !data.chart.result || !data.chart.result[0]) {
        throw new Error(`Données invalides pour ${ticker}`);
      }

      const result = data.chart.result[0];
      const quote = result.indicators.quote[0];
      const timestamps = result.timestamp;
      
      // Prix actuel
      const currentPrice = result.meta.regularMarketPrice || 
                          result.meta.previousClose ||
                          quote.close[quote.close.length - 1];

      // Calcul des indicateurs techniques RÉELS
      const prices = quote.close.filter(p => p !== null);
      
      // RSI sur 14 jours
      const rsi = calculateRSI(prices, 14);
      
      // Moyennes mobiles
      const sma20 = calculateSMA(prices, 20);
      const sma50 = calculateSMA(prices, 50);
      const sma200 = calculateSMA(prices, 200);
      
      // Volume moyen
      const volumes = quote.volume.filter(v => v !== null);
      const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      
      // Support et résistance
      const high52w = result.meta.fiftyTwoWeekHigh || Math.max(...prices.slice(-252));
      const low52w = result.meta.fiftyTwoWeekLow || Math.min(...prices.slice(-252));
      
      return {
        ticker,
        currentPrice,
        previousClose: result.meta.previousClose,
        dayChange: ((currentPrice - result.meta.previousClose) / result.meta.previousClose) * 100,
        rsi,
        sma20,
        sma50,
        sma200,
        avgVolume,
        high52w,
        low52w,
        support: calculateSupport(prices),
        resistance: calculateResistance(prices),
        trend: sma50 > sma200 ? 'bullish' : sma50 < sma200 ? 'bearish' : 'neutral',
        momentum: calculateMomentum(prices),
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Erreur pour ${ticker}:`, error);
      
      // Fallback avec dernière valeur connue
      if (marketData[ticker]) {
        return { ...marketData[ticker], stale: true };
      }
      
      throw error;
    }
  }, [marketData]);

  // Calculs techniques précis
  const calculateRSI = (prices, period = 14) => {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    // Premier calcul
    for (let i = 1; i <= period; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference >= 0) {
        gains += difference;
      } else {
        losses -= difference;
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Lissage Wilder
    for (let i = period + 1; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference >= 0) {
        avgGain = (avgGain * (period - 1) + difference) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - difference) / period;
      }
    }

    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const calculateSMA = (prices, period) => {
    if (prices.length < period) return prices[prices.length - 1];
    
    const relevantPrices = prices.slice(-period);
    return relevantPrices.reduce((sum, price) => sum + price, 0) / period;
  };

  const calculateSupport = (prices) => {
    const recentPrices = prices.slice(-20);
    return Math.min(...recentPrices) * 0.98; // 2% sous le plus bas récent
  };

  const calculateResistance = (prices) => {
    const recentPrices = prices.slice(-20);
    return Math.max(...recentPrices) * 1.02; // 2% au-dessus du plus haut récent
  };

  const calculateMomentum = (prices) => {
    if (prices.length < 10) return 0;
    const oldPrice = prices[prices.length - 10];
    const currentPrice = prices[prices.length - 1];
    return ((currentPrice - oldPrice) / oldPrice) * 100;
  };

  // Mise à jour de toutes les données
  const updateAllData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const allTickers = [
        ...new Set([
          ...portfolio.map(p => p.ticker),
          'MSFT', 'GOOGL', 'NVDA', 'AAPL', 'BRK.B', 'COST', 
          'V', 'META', 'AMZN', 'SCHD', 'O', 'JEPI'
        ])
      ];

      const newMarketData = {};
      
      // Fetch par lots pour éviter de surcharger
      for (let i = 0; i < allTickers.length; i += 3) {
        const batch = allTickers.slice(i, i + 3);
        
        await Promise.all(
          batch.map(async (ticker) => {
            try {
              const data = await fetchMarketData(ticker);
              newMarketData[ticker] = data;
            } catch (err) {
              console.error(`Échec pour ${ticker}:`, err);
            }
          })
        );
        
        // Pause entre les lots
        if (i + 3 < allTickers.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setMarketData(newMarketData);
      setLastUpdate(new Date());
    } catch (err) {
      setError("Erreur lors de la mise à jour des données");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Calcul des métriques du portfolio
  const calculatePortfolioMetrics = () => {
    let totalValue = 0;
    let totalCost = 0;
    let totalGain = 0;
    let totalDividends = 0;

    const enrichedPortfolio = portfolio.map(stock => {
      const market = marketData[stock.ticker];
      const currentPrice = market?.currentPrice || stock.buyPrice;
      const quantity = parseFloat(stock.quantity);
      const buyPrice = parseFloat(stock.buyPrice);
      
      const value = currentPrice * quantity;
      const cost = buyPrice * quantity;
      const gain = value - cost;
      const gainPercent = ((currentPrice - buyPrice) / buyPrice) * 100;
      
      // Estimation dividendes (à améliorer avec API dédiée)
      const estimatedDividendYield = 
        ['SCHD', 'O', 'JEPI'].includes(stock.ticker) ? 0.05 :
        ['JNJ', 'PG', 'KO'].includes(stock.ticker) ? 0.03 :
        0.015;
      
      const annualDividend = value * estimatedDividendYield;
      
      totalValue += value;
      totalCost += cost;
      totalGain += gain;
      totalDividends += annualDividend;

      return {
        ...stock,
        currentPrice,
        value,
        cost,
        gain,
        gainPercent,
        annualDividend,
        market
      };
    });

    return {
      portfolio: enrichedPortfolio,
      totalValue,
      totalCost,
      totalGain,
      totalGainPercent: totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
      totalDividends,
      monthlyDividends: totalDividends / 12
    };
  };

  // Analyse des opportunités d'investissement
  const analyzeInvestmentOpportunities = (availableCash) => {
    const opportunities = [];
    
    // Actions de haute qualité à surveiller
    const watchlist = {
      'MSFT': { quality: 10, sector: 'Tech', type: 'Core' },
      'GOOGL': { quality: 9, sector: 'Tech', type: 'Core' },
      'NVDA': { quality: 9, sector: 'Tech', type: 'Growth' },
      'AAPL': { quality: 9, sector: 'Tech', type: 'Core' },
      'BRK.B': { quality: 10, sector: 'Conglomerate', type: 'Value' },
      'COST': { quality: 8, sector: 'Retail', type: 'Defensive' },
      'V': { quality: 9, sector: 'Finance', type: 'Quality' },
      'META': { quality: 7, sector: 'Tech', type: 'Growth' },
      'AMZN': { quality: 8, sector: 'Tech/Retail', type: 'Growth' },
      'SCHD': { quality: 8, sector: 'ETF', type: 'Income' },
      'O': { quality: 7, sector: 'REIT', type: 'Income' },
      'JEPI': { quality: 7, sector: 'ETF', type: 'Income' }
    };
    
    Object.entries(watchlist).forEach(([ticker, info]) => {
      const market = marketData[ticker];
      if (!market) return;
      
      let score = 0;
      let signals = [];
      
      // Analyse technique
      if (market.rsi < 30) {
        score += 3;
        signals.push(`RSI extrême (${market.rsi.toFixed(1)})`);
      } else if (market.rsi < 40) {
        score += 2;
        signals.push(`RSI survendu (${market.rsi.toFixed(1)})`);
      }
      
      // Position vs moyennes mobiles
      if (market.currentPrice < market.sma200) {
        score += 2;
        signals.push('Sous SMA200');
      }
      if (market.currentPrice < market.sma50) {
        score += 1;
        signals.push('Sous SMA50');
      }
      
      // Proximité du support
      const distanceToSupport = ((market.currentPrice - market.support) / market.support) * 100;
      if (distanceToSupport < 5) {
        score += 2;
        signals.push('Proche du support');
      }
      
      // Momentum
      if (market.momentum < -10) {
        score += 1;
        signals.push('Momentum négatif fort');
      }
      
      // Position dans le range 52 semaines
      const position52w = (market.currentPrice - market.low52w) / (market.high52w - market.low52w);
      if (position52w < 0.3) {
        score += 1;
        signals.push('Bas du range annuel');
      }
      
      // Ajustement selon la qualité
      score = score * (info.quality / 10);
      
      if (score >= 2) {
        opportunities.push({
          ticker,
          score,
          signals,
          info,
          market,
          recommendation: score >= 5 ? 'ACHAT FORT' : score >= 3 ? 'ACHAT' : 'SURVEILLER',
          suggestedAmount: Math.min(
            availableCash * (score >= 5 ? 0.4 : score >= 3 ? 0.25 : 0.15),
            availableCash
          ),
          potentialReturn: ((market.sma50 - market.currentPrice) / market.currentPrice) * 100
        });
      }
    });
    
    return opportunities.sort((a, b) => b.score - a.score);
  };

  // Générer les recommandations d'actions
  const generateActionRecommendations = (enrichedPortfolio) => {
    const recommendations = [];
    
    enrichedPortfolio.forEach(stock => {
      const market = stock.market;
      if (!market) return;
      
      // Analyse des seuils de vente
      if (stock.gainPercent >= SELL_THRESHOLDS.FIRST.gain) {
        let sellPercent = 0;
        let reason = '';
        
        if (stock.gainPercent >= SELL_THRESHOLDS.THIRD.gain) {
          sellPercent = SELL_THRESHOLDS.THIRD.sell;
          reason = `Gain exceptionnel de ${stock.gainPercent.toFixed(1)}%`;
        } else if (stock.gainPercent >= SELL_THRESHOLDS.SECOND.gain) {
          sellPercent = SELL_THRESHOLDS.SECOND.sell;
          reason = `Gain important de ${stock.gainPercent.toFixed(1)}%`;
        } else {
          sellPercent = SELL_THRESHOLDS.FIRST.sell;
          reason = `Gain solide de ${stock.gainPercent.toFixed(1)}%`;
        }
        
        // Protection des actions spéciales
        if (PROTECTED_STOCKS.includes(stock.ticker) && sellPercent > 0.2) {
          sellPercent = 0.2;
          reason += ' (position protégée)';
        }
        
        const sellQuantity = Math.floor(stock.quantity * sellPercent);
        const sellValue = sellQuantity * market.currentPrice;
        
        if (sellQuantity > 0) {
          recommendations.push({
            type: 'VENDRE',
            ticker: stock.ticker,
            action: `Vendre ${(sellPercent * 100).toFixed(0)}% (${sellQuantity} actions)`,
            quantity: sellQuantity,
            value: sellValue,
            reason,
            priority: stock.gainPercent >= 60 ? 'high' : 'medium',
            technicalSignals: {
              rsi: market.rsi,
              trend: market.trend,
              momentum: market.momentum
            },
            reinvestmentSuggestions: analyzeInvestmentOpportunities(sellValue)
          });
        }
      }
      
      // Opportunités d'achat (moyenner à la baisse)
      if (stock.gainPercent <= -20 && market.rsi < 40) {
        recommendations.push({
          type: 'ACHETER',
          ticker: stock.ticker,
          action: 'Renforcer la position',
          reason: `Correction de ${Math.abs(stock.gainPercent).toFixed(1)}% + RSI bas`,
          priority: 'high',
          suggestedAmount: cashAvailable * 0.3
        });
      }
      
      // Alertes de risque
      if (market.rsi > 80 && stock.gainPercent > 50) {
        recommendations.push({
          type: 'ALERTE',
          ticker: stock.ticker,
          action: 'Surveiller de près',
          reason: 'RSI en surchauffe + gains élevés',
          priority: 'medium'
        });
      }
    });
    
    return recommendations;
  };

  // Ajouter une position
  const addStock = () => {
    const ticker = newStock.ticker.trim().toUpperCase();
    const quantity = parseFloat(newStock.quantity);
    const buyPrice = parseFloat(newStock.buyPrice);
    
    if (!ticker || !quantity || !buyPrice || quantity <= 0 || buyPrice <= 0) {
      alert('Veuillez remplir tous les champs avec des valeurs valides');
      return;
    }
    
    if (portfolio.length >= MAX_POSITIONS) {
      alert(`Maximum ${MAX_POSITIONS} positions recommandé pour une gestion optimale`);
      return;
    }
    
    if (portfolio.some(s => s.ticker === ticker)) {
      alert('Cette action est déjà dans votre portfolio');
      return;
    }
    
    const cost = quantity * buyPrice;
    if (cashAvailable > 0 && cost > cashAvailable) {
      alert(`Cash insuffisant. Disponible: ${cashAvailable.toFixed(2)}€`);
      return;
    }
    
    setPortfolio([...portfolio, {
      ticker,
      quantity,
      buyPrice,
      dateAdded: new Date().toISOString(),
      id: Date.now()
    }]);
    
    if (cashAvailable > 0) {
      setCashAvailable(cashAvailable - cost);
    }
    
    setNewStock({ ticker: '', quantity: '', buyPrice: '' });
    setShowAddForm(false);
    
    // Actualiser les données pour la nouvelle action
    setTimeout(() => fetchMarketData(ticker), 100);
  };

  // Supprimer une position
  const removeStock = (id) => {
    const stock = portfolio.find(s => s.id === id);
    if (!stock) return;
    
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer ${stock.ticker} ?`)) {
      const market = marketData[stock.ticker];
      const currentPrice = market?.currentPrice || stock.buyPrice;
      const value = stock.quantity * currentPrice;
      
      setPortfolio(portfolio.filter(s => s.id !== id));
      setCashAvailable(cashAvailable + value);
    }
  };

  // Exécuter une vente
  const executeSale = (stockId, quantity, value) => {
    const stock = portfolio.find(s => s.id === stockId);
    if (!stock) return;
    
    if (window.confirm(`Confirmer la vente de ${quantity} actions ${stock.ticker} pour ${value.toFixed(2)}€ ?`)) {
      const newPortfolio = [...portfolio];
      const index = newPortfolio.findIndex(s => s.id === stockId);
      
      newPortfolio[index] = {
        ...newPortfolio[index],
        quantity: newPortfolio[index].quantity - quantity
      };
      
      if (newPortfolio[index].quantity <= 0) {
        newPortfolio.splice(index, 1);
      }
      
      setPortfolio(newPortfolio);
      setCashAvailable(cashAvailable + value);
    }
  };

  // Charger les données au démarrage
  useEffect(() => {
    updateAllData();
  }, []);

  // Calculs
  const metrics = calculatePortfolioMetrics();
  const recommendations = generateActionRecommendations(metrics.portfolio);
  const opportunities = analyzeInvestmentOpportunities(cashAvailable);

  // Liste des actions recommandées
  const recommendedStocks = [
    { ticker: 'MSFT', name: 'Microsoft', type: 'Core', allocation: '10%', quality: 10 },
    { ticker: 'GOOGL', name: 'Alphabet', type: 'Core', allocation: '8%', quality: 9 },
    { ticker: 'NVDA', name: 'NVIDIA', type: 'Growth', allocation: '8%', quality: 9 },
    { ticker: 'AAPL', name: 'Apple', type: 'Core', allocation: '8%', quality: 9 },
    { ticker: 'BRK.B', name: 'Berkshire', type: 'Value', allocation: '10%', quality: 10 },
    { ticker: 'COST', name: 'Costco', type: 'Defensive', allocation: '6%', quality: 8 },
    { ticker: 'V', name: 'Visa', type: 'Quality', allocation: '6%', quality: 9 },
    { ticker: 'META', name: 'Meta', type: 'Growth', allocation: '5%', quality: 7 },
    { ticker: 'AMZN', name: 'Amazon', type: 'Growth', allocation: '5%', quality: 8 },
    { ticker: 'SCHD', name: 'Schwab Dividend', type: 'Income', allocation: '8%', quality: 8 },
    { ticker: 'O', name: 'Realty Income', type: 'Income', allocation: '5%', quality: 7 },
    { ticker: 'JEPI', name: 'JPM Equity Premium', type: 'Income', allocation: '5%', quality: 7 }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                Portfolio Thaïlande 
                <Shield className="w-8 h-8 text-green-600" />
              </h1>
              <p className="text-gray-600 mt-1">Stratégie Buy & Hold Intelligent - 15%/an</p>
            </div>
            <button
              onClick={updateAllData}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Actualisation...' : 'Actualiser'}
            </button>
          </div>
          
          {lastUpdate && (
            <p className="text-sm text-gray-500">
              Dernière mise à jour : {lastUpdate.toLocaleString('fr-FR')}
            </p>
          )}
          
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Métriques principales */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-gray-500 text-sm">Valeur totale</p>
            <p className="text-2xl font-bold">{metrics.totalValue.toFixed(2)}€</p>
            <DollarSign className="w-6 h-6 text-green-500 mt-2" />
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-gray-500 text-sm">Performance</p>
            <p className={`text-2xl font-bold ${metrics.totalGainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.totalGainPercent >= 0 ? '+' : ''}{metrics.totalGainPercent.toFixed(2)}%
            </p>
            {metrics.totalGainPercent >= 0 ? 
              <TrendingUp className="w-6 h-6 text-green-500 mt-2" /> : 
              <TrendingDown className="w-6 h-6 text-red-500 mt-2" />
            }
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-gray-500 text-sm">Gains/Pertes</p>
            <p className={`text-2xl font-bold ${metrics.totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.totalGain >= 0 ? '+' : ''}{metrics.totalGain.toFixed(2)}€
            </p>
            <PieChart className="w-6 h-6 text-blue-500 mt-2" />
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-gray-500 text-sm">Cash disponible</p>
            <p className="text-2xl font-bold text-blue-600">{cashAvailable.toFixed(2)}€</p>
            <ShoppingCart className="w-6 h-6 text-blue-500 mt-2" />
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-gray-500 text-sm">Dividendes/mois</p>
            <p className="text-2xl font-bold text-purple-600">{metrics.monthlyDividends.toFixed(2)}€</p>
            <Target className="w-6 h-6 text-purple-500 mt-2" />
          </div>
        </div>

        {/* Opportunités d'investissement si cash disponible */}
        {cashAvailable > 500 && opportunities.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-blue-800 flex items-center gap-2">
              <ShoppingCart className="w-6 h-6" />
              Opportunités d'investissement ({cashAvailable.toFixed(0)}€ disponibles)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {opportunities.slice(0, 4).map((opp, idx) => (
                <div key={idx} className="bg-white rounded-lg p-4 border border-blue-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-lg">{opp.ticker}</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                        opp.recommendation === 'ACHAT FORT' ? 'bg-green-100 text-green-800' :
                        opp.recommendation === 'ACHAT' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {opp.recommendation}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{opp.market.currentPrice.toFixed(2)}$</p>
                      <p className="text-xs text-gray-500">
                        RSI: {opp.market.rsi.toFixed(0)} | Score: {opp.score.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    {opp.signals.slice(0, 3).map((signal, i) => (
                      <p key={i} className="mb-1">• {signal}</p>
                    ))}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm">
                      Potentiel: <span className="font-medium text-green-600">
                        +{opp.potentialReturn.toFixed(1)}%
                      </span>
                    </span>
                    <span className="text-sm font-medium">
                      Suggéré: {opp.suggestedAmount.toFixed(0)}€
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommandations d'actions */}
        {recommendations.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-orange-500" />
              Actions recommandées
            </h2>
            <div className="space-y-4">
              {recommendations.map((rec, idx) => (
                <div key={idx}>
                  <div className={`p-4 rounded-lg border-2 ${
                    rec.type === 'VENDRE' ? 'border-orange-300 bg-orange-50' :
                    rec.type === 'ACHETER' ? 'border-green-300 bg-green-50' :
                    'border-yellow-300 bg-yellow-50'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`font-bold text-lg ${
                            rec.type === 'VENDRE' ? 'text-orange-600' :
                            rec.type === 'ACHETER' ? 'text-green-600' :
                            'text-yellow-600'
                          }`}>
                            {rec.type} {rec.ticker}
                          </span>
                          {rec.type === 'ALERTE' && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
                        </div>
                        <p className="text-gray-700">{rec.action}</p>
                        <p className="text-sm text-gray-500 mt-1">{rec.reason}</p>
                        {rec.value && (
                          <p className="text-sm font-medium mt-2">
                            Valeur: {rec.value.toFixed(2)}€
                          </p>
                        )}
                        {rec.technicalSignals && (
                          <div className="flex gap-4 mt-2 text-xs text-gray-600">
                            <span>RSI: {rec.technicalSignals.rsi.toFixed(0)}</span>
                            <span>Trend: {rec.technicalSignals.trend}</span>
                            <span>Momentum: {rec.technicalSignals.momentum.toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          rec.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {rec.priority === 'high' ? 'Priorité haute' : 'Priorité moyenne'}
                        </span>
                        {rec.type === 'VENDRE' && (
                          <button
                            onClick={() => {
                              const stock = metrics.portfolio.find(s => s.ticker === rec.ticker);
                              if (stock) executeSale(stock.id, rec.quantity, rec.value);
                            }}
                            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 text-sm font-medium transition"
                          >
                            Exécuter
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Suggestions de réinvestissement */}
                  {rec.reinvestmentSuggestions && rec.reinvestmentSuggestions.length > 0 && (
                    <div className="mt-3 ml-8 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                      <p className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                        <ArrowRight className="w-4 h-4" />
                        Réinvestir les {rec.value.toFixed(0)}€
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {rec.reinvestmentSuggestions.slice(0, 2).map((sugg, i) => (
                          <div key={i} className="bg-white p-3 rounded border border-blue-200">
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-medium">{sugg.ticker}</span>
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                sugg.recommendation === 'ACHAT FORT' ? 'bg-green-100 text-green-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {sugg.recommendation}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mb-1">
                              {sugg.signals[0]}
                            </p>
                            <p className="text-sm font-medium text-blue-600">
                              Investir: {sugg.suggestedAmount.toFixed(0)}€
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio actuel */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Mon Portfolio ({portfolio.length}/{MAX_POSITIONS})</h2>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
            >
              <Plus className="w-5 h-5" />
              Ajouter
            </button>
          </div>

          {portfolio.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Target className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>Aucune position pour le moment</p>
              <p className="text-sm mt-2">Commencez par ajouter vos premières actions</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-gray-600">
                    <th className="pb-3 font-medium">Ticker</th>
                    <th className="pb-3 font-medium">Qté</th>
                    <th className="pb-3 font-medium">PRU</th>
                    <th className="pb-3 font-medium">Cours</th>
                    <th className="pb-3 font-medium">Valeur</th>
                    <th className="pb-3 font-medium">P/L</th>
                    <th className="pb-3 font-medium">%</th>
                    <th className="pb-3 font-medium">RSI</th>
                    <th className="pb-3 font-medium">Trend</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.portfolio.map(stock => (
                    <tr key={stock.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 font-medium">{stock.ticker}</td>
                      <td className="py-3">{stock.quantity}</td>
                      <td className="py-3">{stock.buyPrice.toFixed(2)}$</td>
                      <td className="py-3">
                        {stock.market ? (
                          <span className={stock.market.stale ? 'text-gray-500' : ''}>
                            {stock.currentPrice.toFixed(2)}$
                          </span>
                        ) : (
                          <span className="text-gray-400">...</span>
                        )}
                      </td>
                      <td className="py-3 font-medium">{stock.value.toFixed(0)}€</td>
                      <td className={`py-3 font-medium ${stock.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.gain >= 0 ? '+' : ''}{stock.gain.toFixed(0)}€
                      </td>
                      <td className={`py-3 font-medium ${stock.gainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.gainPercent >= 0 ? '+' : ''}{stock.gainPercent.toFixed(1)}%
                      </td>
                      <td className="py-3">
                        {stock.market?.rsi ? (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            stock.market.rsi < 30 ? 'bg-green-100 text-green-800' :
                            stock.market.rsi < 40 ? 'bg-blue-100 text-blue-800' :
                            stock.market.rsi > 70 ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {stock.market.rsi.toFixed(0)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3">
                        {stock.market?.trend ? (
                          <span className={`text-xs font-medium ${
                            stock.market.trend === 'bullish' ? 'text-green-600' :
                            stock.market.trend === 'bearish' ? 'text-red-600' :
                            'text-gray-600'
                          }`}>
                            {stock.market.trend === 'bullish' ? '↑' : 
                             stock.market.trend === 'bearish' ? '↓' : '→'}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => removeStock(stock.id)}
                          className="text-red-500 hover:text-red-700 transition"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium text-sm">
                    <td colSpan="4" className="pt-3">TOTAL</td>
                    <td className="pt-3">{metrics.totalValue.toFixed(0)}€</td>
                    <td className={`pt-3 ${metrics.totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {metrics.totalGain >= 0 ? '+' : ''}{metrics.totalGain.toFixed(0)}€
                    </td>
                    <td className={`pt-3 ${metrics.totalGainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {metrics.totalGainPercent >= 0 ? '+' : ''}{metrics.totalGainPercent.toFixed(1)}%
                    </td>
                    <td colSpan="3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Actions recommandées */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Top 12 Actions Recommandées</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedStocks.map(stock => {
              const inPortfolio = portfolio.some(p => p.ticker === stock.ticker);
              const market = marketData[stock.ticker];
              
              return (
                <div 
                  key={stock.ticker} 
                  className={`p-4 rounded-lg border-2 transition ${
                    inPortfolio ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{stock.ticker}</h3>
                      <p className="text-sm text-gray-600">{stock.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        stock.type === 'Core' ? 'bg-blue-100 text-blue-800' :
                        stock.type === 'Growth' ? 'bg-purple-100 text-purple-800' :
                        stock.type === 'Income' ? 'bg-green-100 text-green-800' :
                        stock.type === 'Value' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {stock.type}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                        Q{stock.quality}
                      </span>
                    </div>
                  </div>
                  
                  {market && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Prix</span>
                        <span className="font-medium">{market.currentPrice.toFixed(2)}$</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Jour</span>
                        <span className={`font-medium ${market.dayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {market.dayChange >= 0 ? '+' : ''}{market.dayChange.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">RSI</span>
                        <span className={`font-medium ${
                          market.rsi < 30 ? 'text-green-600' :
                          market.rsi > 70 ? 'text-red-600' :
                          'text-gray-700'
                        }`}>
                          {market.rsi.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Allocation</span>
                      <span className="font-semibold">{stock.allocation}</span>
                    </div>
                  </div>
                  
                  {inPortfolio && (
                    <div className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      En portefeuille
                    </div>
                  )}
                  
                  {!inPortfolio && market && market.rsi < 40 && (
                    <div className="mt-2 text-xs text-blue-600 font-medium animate-pulse">
                      📊 Opportunité d'achat
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Gestion du cash */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">Gestion du cash</h3>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Montant"
                className="border rounded px-3 py-2 w-32"
                id="cashInput"
              />
              <button
                onClick={() => {
                  const input = document.getElementById('cashInput');
                  const value = parseFloat(input.value);
                  if (value && value > 0) {
                    setCashAvailable(cashAvailable + value);
                    input.value = '';
                  }
                }}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
              >
                Ajouter
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById('cashInput');
                  const value = parseFloat(input.value);
                  if (value && value > 0 && value <= cashAvailable) {
                    setCashAvailable(cashAvailable - value);
                    input.value = '';
                  }
                }}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
              >
                Retirer
              </button>
            </div>
          </div>
        </div>

        {/* Modal d'ajout */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-4">Ajouter une position</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Ticker</label>
                  <input
                    type="text"
                    value={newStock.ticker}
                    onChange={(e) => setNewStock({...newStock, ticker: e.target.value.toUpperCase()})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="MSFT"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantité</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStock.quantity}
                    onChange={(e) => setNewStock({...newStock, quantity: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prix d'achat ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStock.buyPrice}
                    onChange={(e) => setNewStock({...newStock, buyPrice: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="420.50"
                  />
                </div>
                {cashAvailable > 0 && (
                  <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded">
                    Cash disponible : {cashAvailable.toFixed(2)}€
                  </div>
                )}
                {newStock.quantity && newStock.buyPrice && (
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                    Coût total : {(parseFloat(newStock.quantity) * parseFloat(newStock.buyPrice)).toFixed(2)}€
                  </div>
                )}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={addStock}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium"
                  >
                    Ajouter
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setNewStock({ ticker: '', quantity: '', buyPrice: '' });
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition font-medium"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioManager;