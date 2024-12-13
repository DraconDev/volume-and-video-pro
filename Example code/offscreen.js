(function () {
    function b(d, e, g) {
        function a(j, i) {
            if (!e[j]) {
                if (!d[j]) {
                    var f = "function" == typeof require && require;
                    if (!i && f) return f(j, !0);
                    if (h) return h(j, !0);
                    var c = new Error("Cannot find module '" + j + "'");
                    throw ((c.code = "MODULE_NOT_FOUND"), c);
                }
                var k = (e[j] = { exports: {} });
                d[j][0].call(
                    k.exports,
                    function (b) {
                        var c = d[j][1][b];
                        return a(c || b);
                    },
                    k,
                    k.exports,
                    b,
                    d,
                    e,
                    g
                );
            }
            return e[j].exports;
        }
        for (
            var h = "function" == typeof require && require, c = 0;
            c < g.length;
            c++
        )
            a(g[c]);
        return a;
    }
    return b;
})()(
    {
        1: [
            function (a, b) {
                const c = "chrome",
                    d = "edge",
                    e = {
                        jghecgabfgfdldnmbfkhmffcabddioke: { id: c },
                        ["hggkhljchkjfpegomlekngmfhkdhafig"]: { id: d },
                    },
                    f =
                        chrome.runtime.id in e
                            ? chrome.runtime.id
                            : "jghecgabfgfdldnmbfkhmffcabddioke",
                    g = e[f].id || c,
                    h = "https://www.petasittek.com/",
                    i = `${h}volume-master/`,
                    j = new URLSearchParams({
                        utm_source: "volume-master",
                        utm_medium: "browser-extension",
                        utm_campaign: g,
                        utm_content: "none",
                    }),
                    k = () => chrome.runtime.getManifest().version,
                    l = (a, b = "") => {
                        const c = new URL(a);
                        if (b) {
                            const a = new URLSearchParams(j);
                            a.set("utm_content", b), (c.search = a.toString());
                        }
                        return c.href;
                    };
                b.exports = {
                    HOMEPAGE_URL: l(h),
                    INSTALL_URL: l(h, "install"),
                    UNINSTALL_URL: l(h, "uninstall"),
                    FOOTER_URL: l(h, "footer"),
                    ISSUE_URL: l(`${i}issue/`),
                    getStoreReviewsUrl: () =>
                        g === c
                            ? `https://chromewebstore.google.com/detail/${f}/reviews`
                            : g === d
                            ? `https://microsoftedge.microsoft.com/addons/detail/${f}`
                            : void 0,
                    getStoreName: () =>
                        g === c
                            ? "Chrome Web Store"
                            : g === d
                            ? "Microsoft Edge Add-ons"
                            : void 0,
                    getUpdateUrl: () => l(`${`${i}version/`}${k()}`, "update"),
                    updateUrl: (a, b) => {
                        const c = new URL(a),
                            d = new URLSearchParams(c.search);
                        return (
                            Object.keys(b).forEach((a) => d.set(a, b[a])),
                            (c.search = d.toString()),
                            c.href
                        );
                    },
                    getAppVersion: k,
                    APP_VERSION_WITH_UPDATE_URL: [
                        "1.10.7",
                        "1.12.6",
                        "1.13.2",
                        "1.14.4",
                    ],
                    APP_VERSION_WITH_UPDATE_URL_EXTENDED: ["1.14.4"],
                    TARGET_SERVICE_WORKER: "service-worker",
                    TARGET_OFFSCREEN_DOCUMENT: "offscreen-document",
                    ACTION_POPUP_AUDIO_DATA_GET: "popup-audio-data-get",
                    ACTION_POPUP_GAIN_CHANGE: "popup-gain-change",
                    ACTION_POPUP_BIQUAD_FILTER_CHANGE:
                        "popup-biquad-filter-change",
                    ACTION_POPUP_ANALYSER_BEFORE_DATA_GET:
                        "popup-analyser-before-data-get",
                    ACTION_POPUP_ANALYSER_AFTER_DATA_GET:
                        "popup-analyser-after-data-get",
                    ACTION_TAB_CLOSED: "tab-closed",
                    ACTION_INIT_OFFSCREEN_DOCUMENT: "init-offscreen-document",
                    ACTION_GET_MEDIA_STREAM_ID: "get-media-stream-id",
                    AUDIO_STATE_AUDIO_CONTEXT: "audioContext",
                    AUDIO_STATE_GAIN_NODE: "gainNode",
                    AUDIO_STATE_BIQUAD_FILTER_NODE: "biquadFilter",
                    AUDIO_STATE_ANALYSER_NODE_BEFORE: "analyserBefore",
                    AUDIO_STATE_ANALYSER_NODE_AFTER: "analyserAfter",
                    ANALYSER_BEFORE_ENABLED: !1,
                    ANALYSER_AFTER_ENABLED: !1,
                    ANALYSER_INTERVAL: 1e3 / 30,
                    ANALYSER_FFT_SIZE: 128,
                    EQUALIZER_PRESETS: {
                        default: {
                            algorithm: "highpass",
                            frequency: 0,
                            q: 1,
                            gain: 0,
                        },
                        voice: {
                            algorithm: "peaking",
                            frequency: 1500,
                            q: 1,
                            gain: 12,
                        },
                        bass: {
                            algorithm: "lowshelf",
                            frequency: 350,
                            q: 1,
                            gain: 6,
                        },
                    },
                    VOLUME_VALUE_DEFAULT: 100,
                    VOLUME_VALUE_MAX: 600,
                    HTML_JS_HOOK_VOLUME_SLIDER: ".js-volume-slider__slider",
                };
            },
            {},
        ],
        2: [
            function (a) {
                const b = a("./modules/config"),
                    c = {};
                window.audioStates = c;
                const d = (a, d) => {
                        const e = new window.AudioContext(),
                            f = e.createMediaStreamSource(d),
                            g = e.createGain(),
                            h = e.createBiquadFilter();
                        h.type = "peaking";
                        const i = e.createAnalyser();
                        i.fftSize = b.ANALYSER_FFT_SIZE;
                        const j = e.createAnalyser();
                        j.fftSize = b.ANALYSER_FFT_SIZE;
                        const k = [
                            f,
                            b.ANALYSER_BEFORE_ENABLED && i,
                            g,
                            h,
                            b.ANALYSER_AFTER_ENABLED && j,
                        ];
                        k
                            .filter((a) => a)
                            .reduce((a, b) => (a.connect(b), b))
                            .connect(e.destination),
                            (c[a] = c[a] || {}),
                            (c[a][b.AUDIO_STATE_AUDIO_CONTEXT] = e),
                            (c[a][b.AUDIO_STATE_GAIN_NODE] = g),
                            (c[a][b.AUDIO_STATE_BIQUAD_FILTER_NODE] = h),
                            (c[a][b.AUDIO_STATE_ANALYSER_NODE_BEFORE] = i),
                            (c[a][b.AUDIO_STATE_ANALYSER_NODE_AFTER] = j);
                    },
                    e = (a, d) => {
                        c[a][b.AUDIO_STATE_GAIN_NODE].gain.value = d / 100;
                    },
                    f = (a, d, e, f, g) => {
                        null != d &&
                            (c[a][b.AUDIO_STATE_BIQUAD_FILTER_NODE].type = d),
                            null != e &&
                                (c[a][
                                    b.AUDIO_STATE_BIQUAD_FILTER_NODE
                                ].frequency.value = e),
                            null != f &&
                                (c[a][
                                    b.AUDIO_STATE_BIQUAD_FILTER_NODE
                                ].Q.value = f),
                            null != g &&
                                (c[a][
                                    b.AUDIO_STATE_BIQUAD_FILTER_NODE
                                ].gain.value = g);
                    },
                    g = async (a) => {
                        const b = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                mandatory: {
                                    chromeMediaSource: "tab",
                                    chromeMediaSourceId: a,
                                },
                            },
                        });
                        return b;
                    },
                    h = async (a, h) => {
                        if (a.target === b.TARGET_OFFSCREEN_DOCUMENT) {
                            if (a.action === b.ACTION_POPUP_AUDIO_DATA_GET) {
                                let d = null;
                                return (
                                    a.tabId in c &&
                                        (d = {
                                            gain: {
                                                gain: c[a.tabId][
                                                    b.AUDIO_STATE_GAIN_NODE
                                                ].gain.value,
                                            },
                                            equalizer: {
                                                algorithm:
                                                    c[a.tabId][
                                                        b
                                                            .AUDIO_STATE_BIQUAD_FILTER_NODE
                                                    ].type,
                                                frequency:
                                                    c[a.tabId][
                                                        b
                                                            .AUDIO_STATE_BIQUAD_FILTER_NODE
                                                    ].frequency.value,
                                                q: c[a.tabId][
                                                    b
                                                        .AUDIO_STATE_BIQUAD_FILTER_NODE
                                                ].Q.value,
                                                gain: c[a.tabId][
                                                    b
                                                        .AUDIO_STATE_BIQUAD_FILTER_NODE
                                                ].gain.value,
                                            },
                                        }),
                                    void h(d)
                                );
                            }
                            if (a.action === b.ACTION_POPUP_GAIN_CHANGE) {
                                if (!(a.tabId in c)) {
                                    const b = await g(a.mediaStreamId);
                                    d(a.tabId, b);
                                }
                                e(a.tabId, a.volumeValue);
                            }
                            if (
                                a.action === b.ACTION_POPUP_BIQUAD_FILTER_CHANGE
                            ) {
                                if (!(a.tabId in c)) {
                                    const b = await g(a.tabId);
                                    d(a.tabId, b);
                                }
                                f(
                                    a.tabId,
                                    a.algorithm,
                                    a.frequency,
                                    a.q,
                                    a.gain
                                );
                            }
                            if (
                                a.action ===
                                b.ACTION_POPUP_ANALYSER_BEFORE_DATA_GET
                            ) {
                                if (a.tabId in c) {
                                    const d =
                                            c[a.tabId][
                                                b.AUDIO_STATE_AUDIO_CONTEXT
                                            ],
                                        e =
                                            c[a.tabId][
                                                b
                                                    .AUDIO_STATE_ANALYSER_NODE_BEFORE
                                            ];
                                    if (d && e) {
                                        const a = e.frequencyBinCount,
                                            b = new Uint8Array(a);
                                        return (
                                            e.getByteFrequencyData(b),
                                            void h({
                                                dataArray: Array.from(b),
                                                bufferLength: a,
                                                sampleRate: d.sampleRate,
                                            })
                                        );
                                    }
                                }
                            }
                            if (
                                a.action ===
                                b.ACTION_POPUP_ANALYSER_AFTER_DATA_GET
                            ) {
                                if (a.tabId in c) {
                                    const d =
                                            c[a.tabId][
                                                b.AUDIO_STATE_AUDIO_CONTEXT
                                            ],
                                        e =
                                            c[a.tabId][
                                                b
                                                    .AUDIO_STATE_ANALYSER_NODE_AFTER
                                            ];
                                    if (d && e) {
                                        const a = e.frequencyBinCount,
                                            b = new Uint8Array(a);
                                        return (
                                            e.getByteFrequencyData(b),
                                            void h({
                                                dataArray: Array.from(b),
                                                bufferLength: a,
                                                sampleRate: d.sampleRate,
                                            })
                                        );
                                    }
                                }
                            }
                            if (a.action === b.ACTION_TAB_CLOSED) {
                                const d = a.tabId;
                                d in c &&
                                    c[d][b.AUDIO_STATE_AUDIO_CONTEXT]
                                        .close()
                                        .then(() => {
                                            delete c[d];
                                        });
                            }
                            h(null);
                        }
                    };
                chrome.runtime.onMessage.addListener(async (a, b, c) => {
                    await h(a, c);
                });
            },
            { "./modules/config": 1 },
        ],
    },
    {},
    [2]
);
