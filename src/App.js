import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertCircle, DollarSign, PieChart, Target, Plus, X, RefreshCw, ArrowRight, Clock, ShoppingCart } from 'lucide-react';

const PortfolioManager = () => {
  // ⚠️ AJOUTE TA CLÉ API ICI
  const API_KEY = 'TA_CLE_API_ALPHA_VANTAGE'; // Remplace par ta vraie clé
  
  const [portfolio, setPortfolio] = useState(() => {
    const saved = localStorage.getItem('portfolioThailand');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentPrices, setCurrentPrices] = useState({});
  const [technicalData, setTechnicalData] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStock, setNewStock] = useState({ ticker: '', quantity: '', buyPrice: '' });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [cashAvailable, setCashAvailable] = useState(() => {
    const saved = localStorage.getItem('cashAvailable');
    return saved ? parseFloat(saved) : 0;
  });

  // Sauvegarder les données
  useEffect(() => {
    localStorage.setItem('portfolioThailand', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    localStorage.setItem('cashAvailable', cashAvailable.toString());
  }, [cashAvailable]);

  // Fonction pour récupérer les données techniques
  const fetchTechnicalIndicators = async (ticker) => {
    try {
      // RSI
      const rsiResponse = await fetch(
        `https://www.alphavantage.co/query?function=RSI&symbol=${ticker}&interval=daily&time_period=14&series_type=close&apikey=${API_KEY}`
      );
      const rsiData = await rsiResponse.json();
      
      // SMA 50 et 200
      const sma50Response = await fetch(
        `https://www.alphavantage.co/query?function=SMA&symbol=${ticker}&interval=daily&time_period=50&series_type=close&apikey=${API_KEY}`
      );
      const sma50Data = await sma50Response.json();
      
      const sma200Response = await fetch(
        `https://www.alphavantage.co/query?function=SMA&symbol=${ticker}&interval=daily&time_period=200&series_type=close&apikey=${API_KEY}`
      );
      const sma200Data = await sma200Response.json();

      // Extraire les dernières valeurs
      const rsiValues = rsiData['Technical Analysis: RSI'];
      const sma50Values = sma50Data['Technical Analysis: SMA'];
      const sma200Values = sma200Data['Technical Analysis: SMA'];

      if (rsiValues && sma50Values && sma200Values) {
        const latestDate = Object.keys(rsiValues)[0];
        const latestRSI = parseFloat(rsiValues[latestDate]['RSI']);
        const latestSMA50 = parseFloat(sma50Values[Object.keys(sma50Values)[0]]['SMA']);
        const latestSMA200 = parseFloat(sma200Values[Object.keys(sma200Values)[0]]['SMA']);

        return {
          rsi: latestRSI,
          sma50: latestSMA50,
          sma200: latestSMA200,
          trend: latestSMA50 > latestSMA200 ? 'bullish' : 'bearish'
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Erreur indicateurs pour ${ticker}:`, error);
      return null;
    }
  };

  // Fonction pour récupérer le prix actuel
  const fetchStockPrice = async (ticker) => {
    try {
      const response = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${API_KEY}`
      );
      const data = await response.json();
      
      if (data['Global Quote']) {
        return parseFloat(data['Global Quote']['05. price']);
      }
      
      // Fallback Yahoo Finance
      const yahooResponse = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`
      );
      const yahooData = await yahooResponse.json();
      
      if (yahooData.chart.result[0]) {
        return yahooData.chart.result[0].meta.regularMarketPrice;
      }
      
      throw new Error('Prix non disponible');
    } catch (error) {
      console.error(`Erreur pour ${ticker}:`, error);
      return null;
    }
  };

  // Mettre à jour tous les prix et indicateurs
  const updateAllData = async () => {
    setLoading(true);
    const prices = {};
    const technical = {};
    
    const allTickers = [
      ...new Set([
        ...portfolio.map(p => p.ticker),
        'MSFT', 'GOOGL', 'NVDA', 'AAPL', 'BRK.B', 'COST', 
        'V', 'META', 'AMZN', 'SCHD', 'O', 'JEPI'
      ])
    ];

    for (const ticker of allTickers) {
      // Prix
      const price = await fetchStockPrice(ticker);
      if (price) {
        prices[ticker] = price;
      }
      
      // Indicateurs techniques (seulement pour les actions growth)
      if (!['SCHD', 'O', 'JEPI', 'BRK.B'].includes(ticker)) {
        await new Promise(resolve => setTimeout(resolve, 12000));
        const techData = await fetchTechnicalIndicators(ticker);
        if (techData) {
          technical[ticker] = techData;
        }
      }
      
      // Pause entre les appels
      if (allTickers.indexOf(ticker) < allTickers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 12000));
      }
    }

    setCurrentPrices(prices);
    setTechnicalData(technical);
    setLastUpdate(new Date());
    setLoading(false);
  };

  // Charger les données au démarrage
  useEffect(() => {
    updateAllData();
  }, []);

  // Calculer les métriques du portfolio
  const calculatePortfolioMetrics = () => {
    let totalValue = 0;
    let totalCost = 0;
    let totalGain = 0;

    const enrichedPortfolio = portfolio.map(stock => {
      const currentPrice = currentPrices[stock.ticker] || stock.buyPrice;
      const value = currentPrice * stock.quantity;
      const cost = stock.buyPrice * stock.quantity;
      const gain = value - cost;
      const gainPercent = ((currentPrice - stock.buyPrice) / stock.buyPrice) * 100;

      totalValue += value;
      totalCost += cost;
      totalGain += gain;

      return {
        ...stock,
        currentPrice,
        value,
        cost,
        gain,
        gainPercent
      };
    });

    return {
      portfolio: enrichedPortfolio,
      totalValue,
      totalCost,
      totalGain,
      totalGainPercent: totalCost > 0 ? (totalGain / totalCost) * 100 : 0
    };
  };

  // Analyser les opportunités de réinvestissement
  const analyzeReinvestmentOpportunities = (cashToInvest) => {
    const opportunities = [];
    
    // Liste des actions de qualité à surveiller
    const qualityStocks = ['MSFT', 'GOOGL', 'NVDA', 'AAPL', 'COST', 'V', 'AMZN', 'META'];
    
    qualityStocks.forEach(ticker => {
      const price = currentPrices[ticker];
      const tech = technicalData[ticker];
      
      if (!price || !tech) return;
      
      let score = 0;
      let reasons = [];
      
      // Analyse RSI
      if (tech.rsi < 30) {
        score += 3;
        reasons.push(`RSI très survendu (${tech.rsi.toFixed(1)})`);
      } else if (tech.rsi < 40) {
        score += 2;
        reasons.push(`RSI survendu (${tech.rsi.toFixed(1)})`);
      } else if (tech.rsi < 50) {
        score += 1;
        reasons.push(`RSI neutre-bas (${tech.rsi.toFixed(1)})`);
      }
      
      // Analyse SMA
      const priceVsSMA50 = ((price - tech.sma50) / tech.sma50) * 100;
      const priceVsSMA200 = ((price - tech.sma200) / tech.sma200) * 100;
      
      if (priceVsSMA200 < -10) {
        score += 3;
        reasons.push(`Prix ${Math.abs(priceVsSMA200).toFixed(1)}% sous SMA200`);
      } else if (priceVsSMA50 < -5) {
        score += 2;
        reasons.push(`Prix ${Math.abs(priceVsSMA50).toFixed(1)}% sous SMA50`);
      }
      
      // Tendance générale
      if (tech.trend === 'bullish' && priceVsSMA50 < 0) {
        score += 1;
        reasons.push('Tendance haussière, prix attractif');
      }
      
      // Vérifier si on a déjà cette action
      const existingPosition = portfolio.find(p => p.ticker === ticker);
      if (existingPosition) {
        const avgPrice = existingPosition.buyPrice;
        if (price < avgPrice * 0.9) {
          score += 2;
          reasons.push('Opportunité de moyenner à la baisse');
        }
      }
      
      if (score > 0) {
        opportunities.push({
          ticker,
          score,
          reasons,
          currentPrice: price,
          rsi: tech.rsi,
          action: score >= 4 ? 'ACHAT FORT' : score >= 2 ? 'ACHAT' : 'SURVEILLER',
          suggestedAmount: score >= 4 ? cashToInvest * 0.5 : cashToInvest * 0.3
        });
      }
    });
    
    return opportunities.sort((a, b) => b.score - a.score);
  };

  // Générer les recommandations d'action
  const generateRecommendations = (enrichedPortfolio) => {
    const recommendations = [];

    enrichedPortfolio.forEach(stock => {
      // Règles de vente par paliers
      if (stock.gainPercent >= 30 && stock.gainPercent < 60) {
        const sellQuantity = Math.floor(stock.quantity * 0.2);
        const sellValue = sellQuantity * stock.currentPrice;
        
        recommendations.push({
          type: 'VENDRE',
          ticker: stock.ticker,
          action: 'Vendre 20%',
          quantity: sellQuantity,
          value: sellValue,
          reason: `Gain de ${stock.gainPercent.toFixed(1)}% - Sécuriser des profits`,
          priority: 'high',
          reinvestmentSuggestion: analyzeReinvestmentOpportunities(sellValue)
        });
      } else if (stock.gainPercent >= 60 && stock.gainPercent < 100) {
        const sellQuantity = Math.floor(stock.quantity * 0.2);
        const sellValue = sellQuantity * stock.currentPrice;
        
        recommendations.push({
          type: 'VENDRE',
          ticker: stock.ticker,
          action: 'Vendre 20% supplémentaires',
          quantity: sellQuantity,
          value: sellValue,
          reason: `Gain de ${stock.gainPercent.toFixed(1)}% - Prise de profits importante`,
          priority: 'high',
          reinvestmentSuggestion: analyzeReinvestmentOpportunities(sellValue)
        });
      } else if (stock.gainPercent >= 100) {
        const sellQuantity = Math.floor(stock.quantity * 0.1);
        const sellValue = sellQuantity * stock.currentPrice;
        
        recommendations.push({
          type: 'VENDRE',
          ticker: stock.ticker,
          action: 'Vendre 10% (garder le reste)',
          quantity: sellQuantity,
          value: sellValue,
          reason: `Gain de ${stock.gainPercent.toFixed(1)}% - Mega winner, garder majorité`,
          priority: 'medium',
          reinvestmentSuggestion: analyzeReinvestmentOpportunities(sellValue)
        });
      }

      // Opportunités d'achat sur correction
      if (stock.gainPercent <= -20) {
        recommendations.push({
          type: 'ACHETER',
          ticker: stock.ticker,
          action: 'Renforcer position',
          reason: `Baisse de ${Math.abs(stock.gainPercent).toFixed(1)}% - Opportunité d'achat`,
          priority: 'high'
        });
      }
    });

    return recommendations;
  };

  // Simuler une vente
  const executeSale = (ticker, quantity, value) => {
    const stockIndex = portfolio.findIndex(s => s.ticker === ticker);
    if (stockIndex !== -1) {
      const newPortfolio = [...portfolio];
      newPortfolio[stockIndex].quantity -= quantity;
      
      if (newPortfolio[stockIndex].quantity <= 0) {
        newPortfolio.splice(stockIndex, 1);
      }
      
      setPortfolio(newPortfolio);
      setCashAvailable(cashAvailable + value);
    }
  };

  // Ajouter une action
  const addStock = () => {
    if (newStock.ticker && newStock.quantity && newStock.buyPrice) {
      if (portfolio.length >= 12) {
        alert('Maximum 12 actions recommandé pour une gestion optimale !');
        return;
      }

      const cost = parseFloat(newStock.quantity) * parseFloat(newStock.buyPrice);
      if (cost > cashAvailable && cashAvailable > 0) {
        alert(`Pas assez de cash disponible. Vous avez ${cashAvailable.toFixed(2)}€`);
        return;
      }

      setPortfolio([...portfolio, {
        ticker: newStock.ticker.toUpperCase(),
        quantity: parseFloat(newStock.quantity),
        buyPrice: parseFloat(newStock.buyPrice),
        dateAdded: new Date().toISOString()
      }]);

      if (cashAvailable > 0) {
        setCashAvailable(cashAvailable - cost);
      }

      setNewStock({ ticker: '', quantity: '', buyPrice: '' });
      setShowAddForm(false);

      setTimeout(() => updateAllData(), 100);
    }
  };

  // Supprimer une action
  const removeStock = (ticker) => {
    const stock = portfolio.find(s => s.ticker === ticker);
    if (stock) {
      const value = stock.quantity * (currentPrices[ticker] || stock.buyPrice);
      setCashAvailable(cashAvailable + value);
    }
    setPortfolio(portfolio.filter(s => s.ticker !== ticker));
  };

  const { 
    portfolio: enrichedPortfolio, 
    totalValue, 
    totalCost, 
    totalGain, 
    totalGainPercent 
  } = calculatePortfolioMetrics();

  const recommendations = generateRecommendations(enrichedPortfolio);
  const globalOpportunities = analyzeReinvestmentOpportunities(cashAvailable);

  // Liste des meilleures actions recommandées
  const topStocks = [
    { ticker: 'MSFT', name: 'Microsoft', type: 'Core', allocation: '10%' },
    { ticker: 'GOOGL', name: 'Alphabet', type: 'Core', allocation: '8%' },
    { ticker: 'NVDA', name: 'NVIDIA', type: 'Growth', allocation: '8%' },
    { ticker: 'AAPL', name: 'Apple', type: 'Core', allocation: '8%' },
    { ticker: 'BRK.B', name: 'Berkshire', type: 'Value', allocation: '10%' },
    { ticker: 'COST', name: 'Costco', type: 'Defensive', allocation: '6%' },
    { ticker: 'V', name: 'Visa', type: 'Quality', allocation: '6%' },
    { ticker: 'META', name: 'Meta', type: 'Growth', allocation: '5%' },
    { ticker: 'AMZN', name: 'Amazon', type: 'Growth', allocation: '5%' },
    { ticker: 'SCHD', name: 'Schwab Dividend ETF', type: 'Income', allocation: '8%' },
    { ticker: 'O', name: 'Realty Income', type: 'Income', allocation: '5%' },
    { ticker: 'JEPI', name: 'JPM Equity Premium', type: 'Income', allocation: '5%' }
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-gray-800">
            Portfolio Thaïlande 🏖️
          </h1>
          <button
            onClick={updateAllData}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
        
        <div className="text-sm text-gray-500">
          Stratégie 15%/an - Buy & Hold Intelligent avec Réinvestissement
          {lastUpdate && ` • Dernière MAJ: ${lastUpdate.toLocaleTimeString()}`}
        </div>
      </div>

      {/* Métriques globales */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Valeur totale</p>
              <p className="text-2xl font-bold">{totalValue.toFixed(0)}€</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Gain/Perte</p>
              <p className={`text-2xl font-bold ${totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalGain >= 0 ? '+' : ''}{totalGain.toFixed(0)}€
              </p>
            </div>
            {totalGain >= 0 ? 
              <TrendingUp className="w-8 h-8 text-green-500" /> : 
              <TrendingDown className="w-8 h-8 text-red-500" />
            }
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Performance</p>
              <p className={`text-2xl font-bold ${totalGainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(1)}%
              </p>
            </div>
            <PieChart className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Cash disponible</p>
              <p className="text-2xl font-bold text-blue-600">{cashAvailable.toFixed(0)}€</p>
            </div>
            <ShoppingCart className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Positions</p>
              <p className="text-2xl font-bold">{portfolio.length}/12</p>
            </div>
            <Target className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Opportunités de réinvestissement si cash disponible */}
      {cashAvailable > 1000 && globalOpportunities.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-blue-800 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" />
            Opportunités de réinvestissement ({cashAvailable.toFixed(0)}€ disponibles)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {globalOpportunities.slice(0, 4).map((opp, idx) => (
              <div key={idx} className="bg-white rounded-lg p-4 border border-blue-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-bold text-lg">{opp.ticker}</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                      opp.action === 'ACHAT FORT' ? 'bg-green-100 text-green-800' :
                      opp.action === 'ACHAT' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {opp.action}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{opp.currentPrice.toFixed(2)}$</p>
                    <p className="text-xs text-gray-500">RSI: {opp.rsi.toFixed(1)}</p>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {opp.reasons.map((reason, i) => (
                    <p key={i} className="mb-1">• {reason}</p>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t">
                  <p className="text-sm font-medium">
                    Montant suggéré : {opp.suggestedAmount.toFixed(0)}€
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommandations avec suggestions de réinvestissement */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-orange-500" />
            Actions recommandées cette semaine
          </h2>
          <div className="space-y-4">
            {recommendations.map((rec, idx) => (
              <div key={idx}>
                <div 
                  className={`p-4 rounded-lg border-2 ${
                    rec.type === 'VENDRE' ? 'border-orange-300 bg-orange-50' : 'border-green-300 bg-green-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <span className={`font-bold ${rec.type === 'VENDRE' ? 'text-orange-600' : 'text-green-600'}`}>
                        {rec.type} {rec.ticker}
                      </span>
                      <p className="text-gray-700 mt-1">{rec.action}</p>
                      <p className="text-sm text-gray-500 mt-1">{rec.reason}</p>
                      {rec.value && (
                        <p className="text-sm font-medium mt-2">
                          Valeur de vente : {rec.value.toFixed(0)}€
                        </p>
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
                          onClick={() => executeSale(rec.ticker, rec.quantity, rec.value)}
                          className="bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600 text-sm"
                        >
                          Exécuter
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Suggestions de réinvestissement */}
                {rec.reinvestmentSuggestion && rec.reinvestmentSuggestion.length > 0 && (
                  <div className="mt-3 ml-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                    <p className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4" />
                      Que faire avec les {rec.value.toFixed(0)}€ ?
                    </p>
                    <div className="space-y-2">
                      {rec.reinvestmentSuggestion.slice(0, 2).map((sugg, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium">{sugg.ticker}</span>
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                            sugg.action === 'ACHAT FORT' ? 'bg-green-100 text-green-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {sugg.action}
                          </span>
                          <p className="text-gray-600 text-xs mt-1">
                            {sugg.reasons[0]} • Suggéré : {sugg.suggestedAmount.toFixed(0)}€
                          </p>
                        </div>
                      ))}
                      {rec.reinvestmentSuggestion.length === 0 && (
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Attendre une meilleure opportunité (RSI inférieur à 40 sur une action de qualité)
                        </p>
                      )}
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
          <h2 className="text-xl font-bold">Mon Portfolio</h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>

        {portfolio.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Commence par ajouter tes premières actions !
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Quantité</th>
                  <th className="pb-3">Prix d'achat</th>
                  <th className="pb-3">Prix actuel</th>
                  <th className="pb-3">Valeur</th>
                  <th className="pb-3">Gain/Perte</th>
                  <th className="pb-3">%</th>
                  <th className="pb-3">RSI</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {enrichedPortfolio.map(stock => {
                  const tech = technicalData[stock.ticker];
                  return (
                    <tr key={stock.ticker} className="border-b hover:bg-gray-50">
                      <td className="py-3 font-medium">{stock.ticker}</td>
                      <td className="py-3">{stock.quantity}</td>
                      <td className="py-3">{stock.buyPrice.toFixed(2)}$</td>
                      <td className="py-3">
                        {currentPrices[stock.ticker] ? 
                          `${stock.currentPrice.toFixed(2)}$` : 
                          <span className="text-gray-400">...</span>
                        }
                      </td>
                      <td className="py-3 font-medium">{stock.value.toFixed(0)}€</td>
                      <td className={`py-3 font-medium ${stock.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.gain >= 0 ? '+' : ''}{stock.gain.toFixed(0)}€
                      </td>
                      <td className={`py-3 font-medium ${stock.gainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.gainPercent >= 0 ? '+' : ''}{stock.gainPercent.toFixed(1)}%
                      </td>
                      <td className="py-3">
                        {tech?.rsi ? (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            tech.rsi < 30 ? 'bg-green-100 text-green-800' :
                            tech.rsi < 40 ? 'bg-blue-100 text-blue-800' :
                            tech.rsi > 70 ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {tech.rsi.toFixed(0)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => removeStock(stock.ticker)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top 12 actions recommandées avec indicateurs */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Top 12 Actions Recommandées</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topStocks.map(stock => {
            const inPortfolio = portfolio.some(p => p.ticker === stock.ticker);
            const currentPrice = currentPrices[stock.ticker];
            const tech = technicalData[stock.ticker];
            
            return (
              <div 
                key={stock.ticker} 
                className={`p-4 rounded-lg border-2 ${
                  inPortfolio ? 'border-green-300 bg-green-50' : 'border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{stock.ticker}</h3>
                    <p className="text-sm text-gray-600">{stock.name}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    stock.type === 'Core' ? 'bg-blue-100 text-blue-800' :
                    stock.type === 'Growth' ? 'bg-purple-100 text-purple-800' :
                    stock.type === 'Income' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {stock.type}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm text-gray-500">Allocation cible</p>
                    <p className="font-semibold">{stock.allocation}</p>
                  </div>
                  {currentPrice && (
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Prix actuel</p>
                      <p className="font-semibold">{currentPrice.toFixed(2)}$</p>
                      {tech?.rsi && (
                        <p className="text-xs text-gray-500 mt-1">RSI: {tech.rsi.toFixed(0)}</p>
                      )}
                    </div>
                  )}
                </div>
                {inPortfolio && (
                  <div className="mt-2 text-xs text-green-600 font-medium">
                    ✓ Dans le portfolio
                  </div>
                )}
                {tech?.rsi < 40 && !inPortfolio && (
                  <div className="mt-2 text-xs text-blue-600 font-medium animate-pulse">
                    📊 Opportunité (RSI bas)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Formulaire d'ajout */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-bold mb-4">Ajouter une action</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Ticker</label>
                <input
                  type="text"
                  value={newStock.ticker}
                  onChange={(e) => setNewStock({...newStock, ticker: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  placeholder="MSFT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantité</label>
                <input
                  type="number"
                  value={newStock.quantity}
                  onChange={(e) => setNewStock({...newStock, quantity: e.target.value})}
                  className="w-full border rounded px-3 py-2"
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
                  className="w-full border rounded px-3 py-2"
                  placeholder="420.50"
                />
              </div>
              {cashAvailable > 0 && (
                <div className="text-sm text-blue-600">
                  Cash disponible : {cashAvailable.toFixed(2)}€
                </div>
              )}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={addStock}
                  className="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewStock({ ticker: '', quantity: '', buyPrice: '' });
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded hover:bg-gray-400"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gestion du cash */}
      <div className="mt-6 bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold">Gestion du cash</h3>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Montant"
              className="border rounded px-2 py-1 w-32"
              id="cashInput"
            />
            <button
              onClick={() => {
                const input = document.getElementById('cashInput');
                const value = parseFloat(input.value);
                if (value) {
                  setCashAvailable(cashAvailable + value);
                  input.value = '';
                }
              }}
              className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
            >
              Ajouter cash
            </button>
          </div>
        </div>
      </div>

      {/* Note sur l'API */}
      {API_KEY === 'TA_CLE_API_ALPHA_VANTAGE' && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            ⚠️ N'oublie pas d'ajouter ta clé API Alpha Vantage dans le code !
            <br />
            Obtiens-la gratuitement sur : https://www.alphavantage.co/support/#api-key
          </p>
        </div>
      )}
    </div>
  );
};

export default PortfolioManager;