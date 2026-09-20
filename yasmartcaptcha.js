/*!
 * YaSmartCaptcha v1.0.1
 *
 * @author Serge Galich <gaserge@mail.ru>
 * @copyright 2026
 * @license MIT
 * @website http://qujs.ru/yasmartcaptcha/
 * 
 * @requires Qu
 */
(function (window, document) {
    'use strict';
    const LIB_NAME = 'YaSmartCaptcha';
    const DATA_PREFIX = 'qu-smartcaptcha';

    if (window.Qu && window.Qu[LIB_NAME]) {
        window.Qu.debug(`⚠️ [${LIB_NAME}] Already registered, skipping duplicate`);
        return;
    }

    let Qu = null;

    const Module = {
        name: LIB_NAME,
        version: '1.0.1',
        _debug: false,
        _initOnce: false,

        _config: {
            enabled: false,
            siteKey: '',
            lazyPreload: true,
            selector: `data-${DATA_PREFIX}`,
            tokenInput: 'smart-token',
            loader: true,
            disableButton: true,
            autoBind: false  
        },

        _captchaLoaded: false,
        _captchaLoading: null,

        _formHandlers: new WeakMap(),
        _autoBindObserver: null,

        _getDataAttrName: function(name) {
            return `data-${DATA_PREFIX}-${name}`;
        },

        _Qu: {
            debug: function(...args) {
                if (Qu && Qu.debug) return Qu.debug(...args);
                console.log(...args);
            },
            loading: function(state, el) {
                if (Qu && Qu.loading) return Qu.loading(state, el);
                if (el) el.style.opacity = state ? 0.5 : 1;
            },
            on: function(el, ev, handler, opts) {
                if (Qu && Qu.on) return Qu.on(el, ev, handler, opts);
                return null;
            },
            off: function(el, ev, handler, opts) {
                if (Qu && Qu.off) return Qu.off(el, ev, handler, opts);
                return null;
            },
            loadAssets: function(item, options) {
                if (Qu && Qu.loadAssets) return Qu.loadAssets(item, options);
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = item;
                    script.async = options.async !== false;
                    script.defer = options.defer || false;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }
        },

        debug: function(...args) {
            if (!this._debug) return;
            this._Qu.debug(`[${LIB_NAME}]`, ...args);
        },

        config: function(options) {
            Object.assign(this._config, options);
            return this;
        },

        use: function(fn) {
            if (typeof fn === 'function') {
                fn(this, Qu);
            }
        },

        extend: function() {
            if (Array.isArray(window[LIB_NAME + 'Extend'])) {
                window[LIB_NAME + 'Extend'].forEach(fn => this.use(fn));
                window[LIB_NAME + 'Extend'] = [];
            }
        },

        loaded: function(quInstance) {
            Qu = quInstance;
            this.extend();
            this.debug(`📗 [${LIB_NAME}] loaded`);
        },

        initOnce: function(params = {}) {
            if (this._initOnce) return;
            this._initOnce = true;

            if (this._config.enabled && this._config.lazyPreload) {
                this.bindInputs();
            }

            if (this._config.enabled && this._config.autoBind) {
                this.autoBindForms();
            }
        },

        init: function(quInstance, params = {}) {
            this.config(params);
            this.initOnce();
        },

        bindInputs: function() {
            const _this = this;
        
            if (!this._config.enabled || !this._config.siteKey) {
                this.debug(`⚠️ [${LIB_NAME}] not enabled or siteKey missing`);
                return;
            }
        
            this._Qu.on('input focusin',
                `form[${this._config.selector}] input, form[${this._config.selector}] textarea, form[${this._config.selector}] select`,
                function() {
                    _this._lazyLoad();
                }
            );
        
            this.debug(`⚙️ [${LIB_NAME}] Lazy binded to inputs`);
        },

        /**
         * Ленивая загрузка скрипта СмартКапчи
         * Используется официальный URL: https://smartcaptcha.yandexcloud.net/captcha.js
         */
        _lazyLoad: function() {
            if (this._captchaLoaded || this._captchaLoading) return this._captchaLoading;
        
            this.debug('⏳ Loading SmartCaptcha script...');
            const _this = this;
        
            // Глобальный колбэк, который вызовет Яндекс-капча после инициализации
            window.smartCaptchaOnload = function() {
                _this._captchaLoaded = true;
                _this._captchaLoading = null;
                _this.debug('✅ SmartCaptcha loaded');
                if (_this._captchaResolve) {
                    _this._captchaResolve();
                    _this._captchaResolve = null;
                }
            };
        
            this._captchaLoading = new Promise((resolve, reject) => {
                _this._captchaResolve = resolve;
                const script = document.createElement('script');
                script.src = 'https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=smartCaptchaOnload';
                script.async = true;
                script.defer = true;
                script.onerror = function(err) {
                    _this._captchaLoading = null;
                    console.error('❌ SmartCaptcha script error', err);
                    reject(err);
                };
                document.head.appendChild(script);
            });
        
            return this._captchaLoading;
        },

        ensureLoaded: function() {
            if (this._captchaLoaded && typeof window.smartCaptcha !== 'undefined') {
                return Promise.resolve();
            }
            return this._lazyLoad().then(() => {
                if (typeof window.smartCaptcha === 'undefined') {
                    throw new Error('SmartCaptcha not available after script load');
                }
            });
        },

        /**
         * Проверка капчи "на лету" (без привязки к форме)
         * Возвращает промис с токеном
         */
        check: function(action = 'submit') {
            const _this = this;
            return this.ensureLoaded().then(() => {
                return new Promise((resolve, reject) => {
                    const tempDiv = document.createElement('div');
                    tempDiv.style.display = 'none';
                    document.body.appendChild(tempDiv);

                    let resolved = false;
                    const timeoutId = setTimeout(() => {
                        if (!resolved) {
                            resolved = true;
                            reject(new Error('SmartCaptcha check timeout'));
                            if (widgetId) window.smartCaptcha.destroy(widgetId);
                            document.body.removeChild(tempDiv);
                        }
                    }, 30000); // 30 секунд таймаут

                    const widgetId = window.smartCaptcha.render(tempDiv, {
                        sitekey: _this._config.siteKey,
                        invisible: true,
                        callback: (token) => {
                            if (resolved) return;
                            resolved = true;
                            clearTimeout(timeoutId);
                            resolve(token);
                            window.smartCaptcha.destroy(widgetId);
                            document.body.removeChild(tempDiv);
                        },
                        'error-callback': (error) => {
                            if (resolved) return;
                            resolved = true;
                            clearTimeout(timeoutId);
                            reject(error || new Error('Captcha error'));
                            window.smartCaptcha.destroy(widgetId);
                            document.body.removeChild(tempDiv);
                        }
                    });

                    try {
                        window.smartCaptcha.execute(widgetId);
                    } catch (e) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            reject(e);
                            window.smartCaptcha.destroy(widgetId);
                            document.body.removeChild(tempDiv);
                        }
                    }
                });
            });
        },

        /**
         * Добавляет токен в форму как скрытое поле
         */
        addTokenToForm: function(form, token) {
            const tokenInputName = this._config.tokenInput || 'smart-token';
            let tokenInput = form.querySelector(`input[name="${tokenInputName}"]`);
            if (!tokenInput) {
                tokenInput = document.createElement('input');
                tokenInput.type = 'hidden';
                tokenInput.name = tokenInputName;
                form.appendChild(tokenInput);
            }
            tokenInput.value = token;
            this.debug('✅ Token added to form');
        },

        autoBindForms: function() {
            const _this = this;
            const selector = this._config.selector;
            const query = 'form[' + selector + ']';
        
            // функция, которая биндит одну форму
            function bindOne(form) {
                if (form._captchaAutoBound) return;    // уже биндили — пропускаем
                form._captchaAutoBound = true;
                _this.bindForm(form, { action: 'submit' });   // ← ВОТ СЮДА твой bindForm
            }
        
            // 1) сразу биндим то, что уже есть на странице
            document.querySelectorAll(query).forEach(bindOne);
        
            // 2) следим за новыми формами
            this._autoBindObserver = new MutationObserver(function(mutations) {
                mutations.forEach(function(m) {
                    m.addedNodes.forEach(function(node) {
                        if (node.nodeType !== 1) return;   // не элемент — пропуск
        
                        // сам node — форма?
                        if (node.matches && node.matches(query)) {
                            bindOne(node);
                        }
        
                        // внутри node есть формы?
                        if (node.querySelectorAll) {
                            node.querySelectorAll(query).forEach(bindOne);
                        }
                    });
                });
            });
        
            this._autoBindObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        /**
         * Привязка невидимой капчи к форме
         * Перехватывает submit, получает токен, добавляет скрытое поле и отправляет форму
         */
        bindForm: function(form, options = {}) {
            if (!this._config.enabled || !this._config.siteKey) {
                this.debug('⚠️ Not enabled or siteKey missing');
                return;
            }
        
            const _this = this;
            const action = options.action || 'submit';

            const useLoader     = options.loader        !== undefined ? !!options.loader        : _this._config.loader;
            const useDisable    = options.disableButton !== undefined ? !!options.disableButton : _this._config.disableButton;
        
            if (this._formHandlers.has(form)) {
                const old = this._formHandlers.get(form);
                form.removeEventListener('submit', old);
                this._formHandlers.delete(form);
            }
        
            const handler = async function(e) {
                if (form._captchaPassed) {
                    form._captchaPassed = false;

                    if (useDisable) {
                        const btn = form.querySelector('[type="submit"]');
                        if (btn) btn.disabled = false;
                    }
                    if (useLoader) {
                        _this._Qu.loading(false, form);
                    }
                    return;
                }
        
                e.preventDefault();

                if (useDisable) {
                    const btn = form.querySelector('[type="submit"]');
                    if (btn) btn.disabled = true;
                }
                if (useLoader) {
                    _this._Qu.loading(true, form);
                }
        
                try {
                    const token = await _this.check(action);
                    _this.addTokenToForm(form, token);
        
                    if (typeof options.onSubmit === 'function') {
                        options.onSubmit(form);
                        return;
                    }
        
                    form._captchaPassed = true;
        
                    if (typeof form.requestSubmit === 'function') {
                        form.requestSubmit();
                    } else {
                        form.submit();
                    }
                } catch (error) {
                    console.error(`❌ [${LIB_NAME}] bindForm failed`, error);
                    if (useDisable) {
                        const btn = form.querySelector('[type="submit"]');
                        if (btn) btn.disabled = false;
                    }
                    if (useLoader) {
                        _this._Qu.loading(false, form);
                    }
                    if (typeof options.onError === 'function') options.onError(error);
                }
            };
        
            this._formHandlers.set(form, handler);
            form.addEventListener('submit', handler);
        
            this.debug(`🔗 [${LIB_NAME}] Form bound: action=${action}`);
        },

        /**
         * Предварительная загрузка скрипта капчи
         */
        preload: function() {
            if (!this._config.enabled || !this._config.siteKey) {
                return Promise.reject('SmartCaptcha not enabled');
            }
            return this.ensureLoaded();
        }
    };

    if (window.Qu) {
        window.Qu.lib(LIB_NAME, Module);
    } else {
        window._QuLibs = window._QuLibs || [];
        window._QuLibs.push({ name: LIB_NAME, instance: Module });
    }

})(window, document);