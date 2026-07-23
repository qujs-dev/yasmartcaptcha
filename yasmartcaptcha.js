/*!
 * YaSmartCaptcha v1.0.0
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
        version: '1.0.3',
        _debug: false,
        _initOnce: false,

        _config: {
            enabled: false,
            siteKey: '',
            lazyPreload: true,
            selector: `data-${DATA_PREFIX}`,
            tokenInput: 'smart-token'
        },

        _captchaLoaded: false,
        _captchaLoading: null,

        // Хранилище обработчиков для форм (WeakMap)
        _formHandlers: new WeakMap(),

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
        },

        init: function(quInstance, params = {}) {
            this.config(params);
            this.initOnce();
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

            // Удаляем старый обработчик, если он уже был привязан к этой форме
            if (this._formHandlers.has(form)) {
                const oldHandler = this._formHandlers.get(form);
                this._Qu.off('submit', form, oldHandler);
                this._formHandlers.delete(form);
            }

            const handler = async function(e) {
                e.preventDefault();

                const submitBtn = form.querySelector('[type="submit"]') || form.querySelector('button');
                if (submitBtn) submitBtn.disabled = true;
                if (options.loader) _this._Qu.loading(true, form);

                try {
                    await _this.ensureLoaded();

                    // Контейнер для виджета (невидимый)
                    let container = form.querySelector('.js-smartcaptcha-container');
                    if (!container) {
                        container = document.createElement('div');
                        container.className = 'js-smartcaptcha-container';
                        container.style.display = 'none';
                        form.appendChild(container);
                    }

                    let widgetId = container.getAttribute('data-widget-id');
                    if (!widgetId) {
                        // Создаём виджет, оборачивая в промис для обработки ошибок
                        widgetId = await new Promise((resolveWidget, rejectWidget) => {
                            const id = window.smartCaptcha.render(container, {
                                sitekey: _this._config.siteKey,
                                invisible: true,
                                callback: () => {
                                    // Этот callback будет вызван после успешного получения токена
                                    // через execute, но мы обработаем токен ниже
                                },
                                'error-callback': (error) => {
                                    rejectWidget(error);
                                }
                            });
                            container.setAttribute('data-widget-id', id);
                            resolveWidget(id);
                        });
                    } else {
                        widgetId = parseInt(widgetId);
                    }

                    // Получаем токен с таймаутом
                    const token = await new Promise((resolveToken, rejectToken) => {
                        const timeoutId = setTimeout(() => {
                            rejectToken(new Error('SmartCaptcha execution timeout'));
                        }, 30000);

                        // Запоминаем колбэк для выполнения
                        const originalCallback = window.smartCaptcha._callbacks?.[widgetId];
                        // Используем хитрость: при execute вызывается callback из render
                        // Можно передать свой callback через параметр, но проще сохранить в глобальный объект
                        // Используем существующий механизм: после execute сработает callback из render,
                        // но нам нужно перехватить токен. Можно использовать промежуточный обработчик.
                        // Вместо этого мы создадим временный слушатель на событие?
                        // Лучше использовать подход с _widgetResolveMap (если он ещё есть)
                        // Для упрощения добавим временный обработчик в _widgetResolveMap (если он определён)
                        if (!_this._widgetResolveMap) _this._widgetResolveMap = {};
                        _this._widgetResolveMap[widgetId] = (token) => {
                            clearTimeout(timeoutId);
                            resolveToken(token);
                        };
                        try {
                            window.smartCaptcha.execute(widgetId);
                        } catch (e) {
                            clearTimeout(timeoutId);
                            delete _this._widgetResolveMap[widgetId];
                            rejectToken(e);
                        }
                    });

                    _this.debug('✅ Token obtained:', token);

                    // Добавляем токен в форму как скрытое поле
                    const tokenInputName = _this._config.tokenInput || 'smart-token';
                    let tokenInput = form.querySelector(`input[name="${tokenInputName}"]`);
                    if (!tokenInput) {
                        tokenInput = document.createElement('input');
                        tokenInput.type = 'hidden';
                        tokenInput.name = tokenInputName;
                        form.appendChild(tokenInput);
                    }
                    tokenInput.value = token;

                    if (options.onSubmit) {
                        options.onSubmit(form);
                    } else {
                        form.submit();
                    }
                } catch (error) {
                    console.error(`❌ [${LIB_NAME}] Form submission failed`, error);
                    if (submitBtn) submitBtn.disabled = false;
                    if (options.loader) _this._Qu.loading(false, form);
                    if (options.onError) options.onError(error);
                }
            };

            this._formHandlers.set(form, handler);
            this._Qu.on('submit', form, handler);
            this.debug(`🔗 Form bound to SmartCaptcha`);
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