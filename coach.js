/* Zayıfla — Yapay zeka koçu: sağlayıcı katmanı, istem, sohbet deposu.
 * Arayüz app.js içindedir. Anahtar yalnızca bu cihazın localStorage'ında durur ve
 * yalnızca seçilen sağlayıcının API adresine gönderilir.
 *
 * Sağlayıcı arayüzü (yeni bir sağlayıcı, ör. Google Gemini, bu nesneyi uygulayarak eklenir):
 *   {
 *     id, label, keyHint, models: { fast: {id,label}, smart: {id,label} },
 *     chat({ key, model, system, messages: [{role:'user'|'assistant', text}], tools: [{name, description, parameters}], maxTokens, signal })
 *       -> Promise<{ text, toolCalls: [{ id, name, input }], stop: 'end'|'tool'|'length'|'refusal' }>
 *       hata durumunda CoachError fırlatır (code: offline|network|timeout|auth|forbidden|credit|rate|overloaded|model|too_large|bad_request|unknown)
 *   }
 */
(function (root) {
  'use strict';

  var SETTINGS_KEY = 'zayifla.coach';
  var CHAT_KEY = 'zayifla.coach.chat';
  var CHAT_CAP = 50;
  var TIMEOUT_MS = 60000;

  function CoachError(code, detail, status) {
    this.name = 'CoachError'; this.code = code; this.detail = detail || ''; this.status = status || 0;
    this.message = MESSAGES[code] || MESSAGES.unknown;
  }
  CoachError.prototype = Object.create(Error.prototype);

  var MESSAGES = {
    offline: 'İnternet bağlantısı yok. Koç için internet gerekiyor; kayıt eklemek ve uygulamanın geri kalanı çevrimdışı çalışmaya devam eder.',
    network: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.',
    timeout: 'Cevap çok gecikti. Biraz sonra tekrar dene.',
    auth: 'API anahtarı geçersiz ya da silinmiş. Ayarlar → Yapay Zeka Koçu bölümünden anahtarı kontrol et ya da yenisini yapıştır.',
    forbidden: 'Bu API anahtarının bu işlem için izni yok. console.anthropic.com\'da anahtarı kontrol et.',
    credit: 'Anthropic hesabında kredi kalmamış görünüyor. console.anthropic.com → Billing bölümünden kredi yükleyebilirsin.',
    rate: 'Çok sık istek gönderildi ya da hesap limiti doldu. Bir dakika bekleyip tekrar dene.',
    overloaded: 'Yapay zeka servisi şu an yoğun. Birkaç dakika sonra tekrar dene.',
    model: 'Seçili model kullanılamıyor. Ayarlar\'dan diğer modeli seçmeyi dene.',
    too_large: 'Mesaj çok uzun. Sohbeti temizleyip daha kısa yazmayı dene.',
    bad_request: 'İstek kabul edilmedi. Sohbeti temizleyip tekrar dene.',
    refusal: 'Koç bu soruya cevap veremedi. Soruyu farklı şekilde sormayı dene.',
    nokey: 'Önce Ayarlar\'dan bir API anahtarı eklemelisin.',
    unknown: 'Beklenmeyen bir hata oldu. Tekrar dene.'
  };

  function isOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }

  /* ------------------------------ Anthropic ------------------------------ */
  var anthropic = {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    keyHint: 'sk-ant-…',
    url: 'https://api.anthropic.com/v1/messages',
    models: {
      fast: { id: 'claude-haiku-5-5', label: 'Hızlı ve ekonomik', sub: 'Claude Haiku 5.5 · günlük kullanım için yeterli' },
      smart: { id: 'claude-sonnet-5-5', label: 'Daha akıllı', sub: 'Claude Sonnet 5.5 · daha iyi cevap, ~20 kat pahalı' }
    },
    looksLikeKey: function (k) { return /^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(String(k || '').trim()); },
    chat: function (o) {
      var modelId = o.model;
      var body = {
        model: modelId,
        max_tokens: o.maxTokens || 2048,
        system: o.system,
        messages: o.messages.map(function (m) { return { role: m.role, content: m.text }; }),
        output_config: { effort: 'low' }
      };
      if (o.tools && o.tools.length) {
        body.tools = o.tools.map(function (t) { return { name: t.name, description: t.description, input_schema: t.parameters }; });
        body.tool_choice = { type: 'auto' };
      }
      var headers = {
        'content-type': 'application/json',
        'x-api-key': o.key,
        'anthropic-version': '2026-10-21',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
      // Sonnet: güvenlik sınıflandırıcısı reddederse sunucu tarafında uygun modele düşsün
      if (/sonnet/.test(modelId)) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
      return request(anthropic.url, headers, body, o.signal).then(function (data) {
        var text = '', calls = [];
        (data.content || []).forEach(function (b) {
          if (b.type === 'text' && b.text) text += (text ? '\n' : '') + b.text;
          else if (b.type === 'tool_use') calls.push({ id: b.id, name: b.name, input: b.input || {} });
        });
        var sr = data.stop_reason;
        if (sr === 'refusal' && !text && !calls.length) throw new CoachError('refusal');
        return { text: text.trim(), toolCalls: calls, stop: sr === 'tool_use' ? 'tool' : sr === 'max_tokens' ? 'length' : sr === 'refusal' ? 'refusal' : 'end' };
      });
    }
  };

  function request(url, headers, body, signal) {
    if (isOffline()) return Promise.reject(new CoachError('offline'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    if (signal && ctrl) signal.addEventListener('abort', function () { ctrl.abort(); });
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined, cache: 'no-store', credentials: 'omit' })
      .then(function (res) {
        clearTimeout(timer);
        return res.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
          if (res.ok && data) return data;
          throw httpError(res.status, data);
        });
      }, function (err) {
        clearTimeout(timer);
        if (err && err.name === 'CoachError') throw err;
        if (timedOut) throw new CoachError('timeout');
        if (err && err.name === 'AbortError') throw new CoachError('aborted');
        throw new CoachError(isOffline() ? 'offline' : 'network', err && err.message);
      });
  }

  function httpError(status, data) {
    var e = (data && data.error) || {};
    var type = e.type || '', msg = String(e.message || '');
    var code;
    if (status === 401 || type === 'authentication_error') code = 'auth';
    else if (status === 402 || type === 'billing_error' || /credit balance|billing|purchase credits/i.test(msg)) code = 'credit';
    else if (status === 403 || type === 'permission_error') code = 'forbidden';
    else if (status === 429 || type === 'rate_limit_error') code = 'rate';
    else if (status === 404 || type === 'not_found_error') code = 'model';
    else if (status === 413 || type === 'request_too_large') code = 'too_large';
    else if (status === 529 || status >= 500 || type === 'overloaded_error' || type === 'api_error') code = 'overloaded';
    else if (status === 400) code = 'bad_request';
    else code = 'unknown';
    return new CoachError(code, msg, status);
  }

  var PROVIDERS = { anthropic: anthropic };

  /* ------------------------------ Ayarlar ------------------------------ */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } }

  function loadSettings() {
    var s = { provider: 'anthropic', key: '', model: 'fast', mode: '' };
    try {
      var d = JSON.parse(lsGet(SETTINGS_KEY) || 'null');
      if (d && typeof d === 'object') {
        if (PROVIDERS[d.provider]) s.provider = d.provider;
        if (typeof d.key === 'string') s.key = d.key.trim();
        if (d.model === 'smart') s.model = 'smart';
        if (d.mode === 'app' || d.mode === 'chat') s.mode = d.mode;
      }
    } catch (e) { /* bozuk ayar: varsayılanlar */ }
    return s;
  }
  function saveSettings(s) { return lsSet(SETTINGS_KEY, JSON.stringify({ provider: s.provider, key: s.key, model: s.model, mode: s.mode })); }
  function maskKey(k) { k = String(k || ''); return k.length > 14 ? k.slice(0, 7) + '…' + k.slice(-4) : '••••'; }

  /* ------------------------------ Sohbet ------------------------------ */
  function loadChat() {
    try {
      var d = JSON.parse(lsGet(CHAT_KEY) || '[]');
      if (!Array.isArray(d)) return [];
      return d.filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string'; }).slice(-CHAT_CAP);
    } catch (e) { return []; }
  }
  function saveChat(list) {
    var trimmed = list.slice(-CHAT_CAP);
    if (trimmed.length !== list.length) { list.splice(0, list.length - trimmed.length); }
    return lsSet(CHAT_KEY, JSON.stringify(trimmed));
  }
  function clearChat() { lsDel(CHAT_KEY); }
  function clearAll() { lsDel(CHAT_KEY); lsDel(SETTINGS_KEY); }

  /* ------------------------------ İstem ------------------------------ */
  var ROLE = [
    'Sen "Zayıfla" kalori takip uygulamasının beslenme ve kilo verme koçusun. Kullanıcıyla Türkçe, "sen" diye, sıcak ama dürüst konuş.',
    '- Kanıta dayalı konuş: kalori dengesi, yeterli protein, lif, sebze, su, uyku, günlük adım. Detoks, mucize diyet, yağ yakıcı gibi önerilerde bulunma.',
    '- Kısa cevap ver: çoğunlukla 2-5 cümle ya da en fazla 4 kısa madde. Uzun açıklamayı yalnızca istenirse yap. Başlık ve tablo kullanma.',
    '- Türk mutfağını iyi bil (ev yemekleri, zeytinyağlılar, bakliyat, çorbalar, hamur işleri; tabak, kase, dilim, kepçe porsiyonları). Önerileri kalan kaloriye ve proteine göre somut ver, ör. "mercimek çorbası + 1 kase yoğurt + salata ≈ 450 kcal".',
    '- <veriler> içindeki JSON kullanıcının uygulamadaki gerçek kayıtlarıdır; yorumlarını buna dayandır. Tartıdaki günlük oynamalar su/tuz/sindirimden olabilir, trend kilosuna bak. Kayıt eksikse nazikçe söyle. Uydurma veri kullanma.',
    '- Doktor değilsin; tanı koyma, ilaç önerme. Hastalık, gebelik/emzirme, ilaç kullanımı, ciddi belirti, yeme bozukluğu işaretleri (aşırı kısıtlama, tıkınma sonrası telafi, kusma, yemek korkusu) varsa ya da hedef/alım kadında 1200, erkekte 1500 kcal altındaysa çok düşük kaloriyi destekleme; şefkatle doktora veya diyetisyene yönlendir.',
    '- Destekleyici ol ama gerçekçi: suçlama yok, küçük ve uygulanabilir bir sonraki adım öner.'
  ].join('\n');
  var TOOL_RULES = '- Kullanıcı yediği/içtiği bir şeyi söylerse (ör. "öğlen bir tabak karnıyarık yedim") her yiyecek için ayrı log_food çağrısı yap; gramı ve besin değerlerini tipik Türk porsiyonuna göre tahmin et ve araç çağrısının yanında tek kısa cümle yaz. Kayıt kullanıcı onaylayınca yapılır. Sadece soru soruyorsa (ör. "akşam ne yesem?") log_food çağırma.';
  var APP_RULES = '- Bu konuşma uygulamanın dışında; yediklerini kaydetmeni isterse kalori tahminini söyle, kullanıcı uygulamaya kendisi girecek.';

  function systemPrompt(withTools) { return ROLE + '\n' + (withTools ? TOOL_RULES : APP_RULES); }

  var LOG_FOOD = {
    name: 'log_food',
    description: 'Kullanıcının yediğini söylediği tek bir yiyeceği/içeceği günlüğe eklemeyi önerir. Kullanıcı uygulamada onaylayınca kaydedilir. Veritabanında olmayan yemekler için de tahmini değerlerle kullan.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Türkçe yiyecek adı ve porsiyonu, ör. "Karnıyarık (1 tabak)"' },
        grams: { type: 'number', description: 'Tahmini toplam miktar, gram (içecekler için ml)' },
        kcal: { type: 'number', description: 'Toplam kalori' },
        protein: { type: 'number', description: 'Toplam protein, gram' },
        carb: { type: 'number', description: 'Toplam karbonhidrat, gram' },
        fat: { type: 'number', description: 'Toplam yağ, gram' },
        meal: { type: 'string', enum: ['kahvalti', 'ogle', 'aksam', 'ara'], description: 'Öğün: kahvalti, ogle, aksam ya da ara (ara öğün)' },
        day: { type: 'string', enum: ['bugun', 'dun'], description: 'Hangi gün yendi; belirtilmemişse bugun' }
      },
      required: ['name', 'grams', 'kcal', 'protein', 'carb', 'fat', 'meal'],
      additionalProperties: false
    }
  };

  /** Model girdisini doğrular; geçersizse null */
  function cleanFoodCall(input, fallbackMeal) {
    if (!input || typeof input !== 'object') return null;
    var n = function (v, max) { v = Number(v); return isFinite(v) && v >= 0 && v <= max ? v : NaN; };
    var name = String(input.name || '').trim().slice(0, 80);
    var kcal = n(input.kcal, 5000);
    if (!name || isNaN(kcal)) return null;
    var g = n(input.grams, 5000);
    return {
      name: name, grams: isNaN(g) ? 0 : Math.round(g), kcal: Math.round(kcal),
      p: Math.round((n(input.protein, 500) || 0) * 10) / 10, c: Math.round((n(input.carb, 1000) || 0) * 10) / 10, f: Math.round((n(input.fat, 500) || 0) * 10) / 10,
      meal: ['kahvalti', 'ogle', 'aksam', 'ara'].indexOf(input.meal) >= 0 ? input.meal : (fallbackMeal || 'ara'),
      day: input.day === 'dun' ? 'dun' : 'bugun'
    };
  }

  /** Sohbet geçmişini API'ye gidecek kısa metin listesine çevirir (sırayla user/assistant, user ile başlar) */
  function toApiMessages(chat, limit) {
    var out = [];
    chat.filter(function (m) { return !m.error && !m.pending; }).slice(-(limit || 14)).forEach(function (m) {
      var text = m.text || '';
      if (m.role === 'assistant' && m.cards && m.cards.length) {
        text += (text ? '\n' : '') + m.cards.map(function (c) {
          var st = c.status === 'added' ? 'kullanıcı ekledi' : c.status === 'skipped' ? 'kullanıcı vazgeçti' : 'onay bekliyor';
          return '[Kayıt önerisi: ' + c.item.name + ', ' + c.item.grams + ' g, ' + c.item.kcal + ' kcal — ' + st + ']';
        }).join('\n');
      }
      if (!text) return;
      var last = out[out.length - 1];
      if (last && last.role === m.role) last.text += '\n\n' + text;
      else out.push({ role: m.role, text: text });
    });
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  /** "Claude uygulamasında sor" için yapıştırılacak tek parça metin */
  function clipboardPrompt(contextJson, question) {
    var q = String(question || '').trim() || 'Bugün nasıl gidiyorum? Kısaca değerlendir ve bir sonraki öğün için öneri ver.';
    return systemPrompt(false) + '\n\n<veriler>\n' + contextJson + '\n</veriler>\n\nSorum: ' + q;
  }

  root.ZCoach = {
    PROVIDERS: PROVIDERS, MESSAGES: MESSAGES, CoachError: CoachError, CHAT_CAP: CHAT_CAP,
    provider: function (id) { return PROVIDERS[id] || anthropic; },
    loadSettings: loadSettings, saveSettings: saveSettings, maskKey: maskKey,
    loadChat: loadChat, saveChat: saveChat, clearChat: clearChat, clearAll: clearAll,
    systemPrompt: systemPrompt, TOOLS: [LOG_FOOD], cleanFoodCall: cleanFoodCall,
    toApiMessages: toApiMessages, clipboardPrompt: clipboardPrompt, isOffline: isOffline
  };
})(typeof window !== 'undefined' ? window : globalThis);
