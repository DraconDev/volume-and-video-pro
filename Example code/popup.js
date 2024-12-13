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
                const c = a("../modules/config"),
                    d = "2018-01-01",
                    e = "2029-12-31",
                    f = 100,
                    g = 200,
                    h = `If you like Volume Master please rate it on
  <a href="${c.getStoreReviewsUrl()}" target="_blank" tabindex="-1">
    ${c.getStoreName()} 
  </a>
  to let me know that. If you don't want to - it's ok. Thank you for your feedback and have a nice day! ☀️`,
                    i =
                        'Volume Master is a "pay what you like" software. You can use it for free, forever. \uD83D\uDE0A',
                    j = `However, if you really like it, you can <a href="https://www.petasittek.com/volume-master/pay-what-you-like/" target="_blank" tabindex="-1">pay for it to support its development</a>. As a thank-you you'll get <strong>800&nbsp;% volume boost</strong>. It's up to you and it's ok if you don't want to. Thank you and have a nice day! ☀️`;
                b.exports = {
                    notifications: [
                        {
                            id: "8evjmxn94cchdjii45kq2pdsnndzcxsu",
                            priority: g,
                            title: i,
                            message: j,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 1,
                            maxDaysFromInstallation: 11,
                        },
                        {
                            id: "v3za9vcy6rji3kx3t32wzjdqi7ztqmxw",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 12,
                            maxDaysFromInstallation: 13,
                        },
                        {
                            id: "cvifms5exdmqy2g3ar4kzhmxi4zepvvq",
                            priority: f,
                            title: "Tip: custom keyboard shortcut",
                            message:
                                "Just type <strong>chrome://extensions/shortcuts</strong> in the address bar and set your own shortcut to open Volume Master.",
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 6,
                            maxDaysFromInstallation: null,
                        },
                        {
                            id: "h6s5u6eqgjpxwqasujret4vz2pnkj945",
                            priority: f,
                            title: "Tip: use keys 0 - 6 to adjust volume",
                            message:
                                "Right after opening Volume Master press keys 0&nbsp;-&nbsp;6 to change volume from 0&nbsp;% to 600&nbsp;% respectively.",
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 8,
                            maxDaysFromInstallation: null,
                        },
                        {
                            id: "tk7tse8yedvsdyve2dtpzd349hkbnugk",
                            priority: f,
                            title: "Tip: adjust volume with arrow keys",
                            message:
                                "Right after opening Volume Master press:<ul><li>\u2B06\uFE0F or \u27A1\uFE0F to volume up</li><li>\u2B07\uFE0F or \u2B05\uFE0F to volume down</li></ul>",
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 12,
                            maxDaysFromInstallation: null,
                        },
                        {
                            id: "fms5exdvb8b9e6kk4bc2pckq3zcvifnr",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 14,
                            maxDaysFromInstallation: 29,
                        },
                        {
                            id: "b8b9uivc4yde6kk4bc2pckq3zjt2vfnr",
                            priority: g,
                            title: i,
                            message: j,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 30,
                            maxDaysFromInstallation: 89,
                        },
                        {
                            id: "e6kk46kk4bc2pcxdvb8b9kq3zjt2vfnr",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 90,
                            maxDaysFromInstallation: 179,
                        },
                        {
                            id: "ff9cvpupxqqwrxm5p7at3xt332igtb38",
                            priority: g,
                            title: i,
                            message: j,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 180,
                            maxDaysFromInstallation: 269,
                        },
                        {
                            id: "jibaemgq5hw777pksb27ywv6y2dppiyh",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 270,
                            maxDaysFromInstallation: 364,
                        },
                        {
                            id: "uvfqat8542f87kk6yj5hnm556qbru8b6",
                            priority: g,
                            title: `Congratulations, you're celebrating 1 year with Volume Master! 🎉`,
                            message: `${i} ${j}`,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 365,
                            maxDaysFromInstallation: 539,
                        },
                        {
                            id: "jbve32m6sefvfc6bwmkmngqgxmnzsdtd",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 540,
                            maxDaysFromInstallation: 729,
                        },
                        {
                            id: "b66vv722k5v3ndkfase93pr7hupb9yyt",
                            priority: g,
                            title: `Congratulations, you're celebrating 2 years with Volume Master! 🎉`,
                            message: `${i} ${j}`,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 730,
                            maxDaysFromInstallation: 899,
                        },
                        {
                            id: "kv79qxn7fh8s3z8xh8yiu7qdig6gn5ws",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 900,
                            maxDaysFromInstallation: 1094,
                        },
                        {
                            id: "p52xqawqq7wa525m3m7fvxnuczfhu3ua",
                            priority: g,
                            title: `Congratulations, you're now celebrating 3 years with Volume Master! 🎉`,
                            message: `${i} ${j}`,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 1095,
                            maxDaysFromInstallation: 1259,
                        },
                        {
                            id: "mvjgy5swr8h35htufk7y3aziupxscqtg",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 1260,
                            maxDaysFromInstallation: 1459,
                        },
                        {
                            id: "t6c9hnd8kyz2kqpmrvdwa6jdnhyvgz9w",
                            priority: g,
                            title: `Congratulations, you're now celebrating 4 years with Volume Master! 🎉`,
                            message: `${i} ${j}`,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 1460,
                            maxDaysFromInstallation: 1639,
                        },
                        {
                            id: "fypaf96knvw49uprc5ux9fkbcx4mj7fr",
                            priority: g,
                            title: "",
                            message: h,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 1640,
                            maxDaysFromInstallation: 1824,
                        },
                        {
                            id: "5dfhc4hhkp3vb7dm6ge63tu7p8d4r3ww",
                            priority: g,
                            title: `Congratulations, you're now celebrating 5 years with Volume Master! 🎉`,
                            message: `${i} ${j}`,
                            dateFrom: d,
                            dateTo: e,
                            minDaysFromInstallation: 1825,
                            maxDaysFromInstallation: null,
                        },
                    ],
                };
            },
            { "../modules/config": 9 },
        ],
        2: [
            function (a, b) {
                const c = a("./config"),
                    { getSliderValues: d } = a("./audio-gain.js"),
                    e = document.querySelector(".js-actions__reset"),
                    f = document.querySelector(".js-actions__restore"),
                    g = document.querySelector(c.HTML_JS_HOOK_VOLUME_SLIDER),
                    h = 100,
                    i = async (a) => {
                        const b = await chrome.runtime.sendMessage({
                            action: c.ACTION_POPUP_AUDIO_DATA_GET,
                            target: c.TARGET_OFFSCREEN_DOCUMENT,
                            tabId: a,
                        });
                        if (!b)
                            e.classList.add("is-hidden"),
                                f.classList.contains("is-hidden") &&
                                    (e.classList.remove("is-hidden"),
                                    e.setAttribute("disabled", "disabled"));
                        else {
                            e.classList.remove("is-hidden");
                            const a = d(c.VOLUME_VALUE_DEFAULT);
                            g.value == a.indexOf(h)
                                ? e.setAttribute("disabled", "disabled")
                                : e.removeAttribute("disabled");
                        }
                    },
                    j = () => {
                        e.addEventListener("click", () => {
                            const a = d(c.VOLUME_VALUE_DEFAULT);
                            (g.value = a.indexOf(h)),
                                g.dispatchEvent(new Event("input")),
                                g.dispatchEvent(new Event("change"));
                        });
                    };
                b.exports = {
                    initActionResetUI: async (a) => {
                        await i(a), j();
                    },
                    renderActionResetUI: i,
                };
            },
            { "./audio-gain.js": 7, "./config": 9 },
        ],
        3: [
            function (a, b) {
                const c = a("./config"),
                    d = a("./chrome/storage-local.js"),
                    { getSliderValues: e, getClosestValue: f } =
                        a("./audio-gain.js"),
                    g = document.querySelector(".js-actions__restore"),
                    h = document.querySelector(".js-actions__restore-value"),
                    i = document.querySelector(".js-actions__restore-domain"),
                    j = document.querySelector(c.HTML_JS_HOOK_VOLUME_SLIDER),
                    k = "domains-settings",
                    l = async (a, b) => {
                        const l = await chrome.runtime.sendMessage({
                            action: c.ACTION_POPUP_AUDIO_DATA_GET,
                            target: c.TARGET_OFFSCREEN_DOCUMENT,
                            tabId: a,
                            source: "action-restore-ui",
                        });
                        if (l) g.classList.add("is-hidden");
                        else {
                            const a = await d.get(k, {}),
                                c = new URL(b).hostname,
                                l = a[c] && a[c].volume;
                            Number.isInteger(l) &&
                                (g.classList.remove("is-hidden"),
                                (h.textContent = l),
                                (i.textContent = c),
                                g.addEventListener(
                                    "click",
                                    () => {
                                        const a = e(j.dataset.maxVolume),
                                            b = f(a, l);
                                        (j.value = a.indexOf(b)),
                                            j.dispatchEvent(new Event("input")),
                                            j.dispatchEvent(
                                                new Event("change")
                                            );
                                    },
                                    { once: !0 }
                                ));
                        }
                    };
                b.exports = {
                    initActionRestoreUI: async (a, b) => {
                        await l(a, b);
                    },
                    updateActionRestoreUI: async (a, b) => {
                        const f = e(j.dataset.maxVolume),
                            h = await d.get(k, {}),
                            i = new URL(a).hostname,
                            l = f[b];
                        (h[i] = h[i] || {}),
                            (h[i].volume = l),
                            l === c.VOLUME_VALUE_DEFAULT && delete h[i].volume,
                            await d.set(k, h),
                            g.classList.add("is-hidden");
                    },
                };
            },
            {
                "./audio-gain.js": 7,
                "./chrome/storage-local.js": 8,
                "./config": 9,
            },
        ],
        4: [
            function (a, b) {
                var c = Math.floor;
                const d = a("./config"),
                    e = 255;
                let f = !1;
                const g = document.querySelector(
                        ".js-audio-equalizer__frequency"
                    ),
                    h = document.querySelector(".js-audio-analyser"),
                    i = h.querySelector(".js-audio-analyser__before-wrapper"),
                    j = h.querySelector(".js-audio-analyser__before-canvas"),
                    k = j.getContext("2d"),
                    l = h.querySelector(".js-audio-analyser__before-freq-end"),
                    m = h.querySelector(".js-audio-analyser__after-wrapper"),
                    n = h.querySelector(".js-audio-analyser__after-canvas"),
                    o = n.getContext("2d"),
                    p = h.querySelector(".js-audio-analyser__after-freq-end"),
                    q = { before: 0, after: 0 };
                let r;
                const s = async (a) => {
                        (r = a),
                            h.classList.remove("is-hidden"),
                            d.ANALYSER_BEFORE_ENABLED &&
                                (i.classList.remove("is-hidden"),
                                (j.width = i.offsetWidth),
                                requestAnimationFrame(await t)),
                            d.ANALYSER_AFTER_ENABLED &&
                                (m.classList.remove("is-hidden"),
                                (n.width = m.offsetWidth),
                                requestAnimationFrame(await u));
                    },
                    t = async (a) => {
                        requestAnimationFrame(await t),
                            await v(
                                a,
                                "before",
                                d.ACTION_POPUP_ANALYSER_BEFORE_DATA_GET,
                                j,
                                k
                            );
                    },
                    u = async (a) => {
                        requestAnimationFrame(await u),
                            await v(
                                a,
                                "after",
                                d.ACTION_POPUP_ANALYSER_AFTER_DATA_GET,
                                n,
                                o
                            );
                    },
                    v = async (a, b, h, i, j) => {
                        if (!(a - q[b] < d.ANALYSER_INTERVAL)) {
                            q[b] = a;
                            const k = await chrome.runtime.sendMessage({
                                action: h,
                                target: d.TARGET_OFFSCREEN_DOCUMENT,
                                tabId: r,
                            });
                            if (k) {
                                const {
                                    dataArray: a,
                                    bufferLength: b,
                                    sampleRate: d,
                                } = k;
                                f ||
                                    ((l.textContent = d / 2),
                                    (p.textContent = d / 2),
                                    g.setAttribute("max", d / 2),
                                    (f = !0)),
                                    j.clearRect(0, 0, i.width, i.height);
                                const h = i.width / b,
                                    m = Math.ceil(h),
                                    n = i.height;
                                for (let d = 0; d < b; d++) {
                                    const b = a[d],
                                        f = c(d * h),
                                        g = n - c((n * b) / e),
                                        i = c((n * b) / e);
                                    (j.fillStyle = `hsl(${
                                        b + 125
                                    }, 100%, 65%)`),
                                        j.fillRect(f, g, m, i);
                                }
                            }
                        }
                    };
                b.exports = {
                    initAnalyserUI: async (a) => {
                        (d.ANALYSER_BEFORE_ENABLED ||
                            d.ANALYSER_AFTER_ENABLED) &&
                            (await s(a));
                    },
                };
            },
            { "./config": 9 },
        ],
        5: [
            function (a, b) {
                const c = a("./config"),
                    { renderActionResetUI: d } = a("./action-reset-ui"),
                    e = document.querySelector(".js-audio-equalizer"),
                    f = e.querySelectorAll(".js-audio-equalizer__preset"),
                    g = document.querySelector(
                        ".js-audio-equalizer__algorithm"
                    ),
                    h = document.querySelector(
                        ".js-audio-equalizer__frequency"
                    ),
                    i = document.querySelector(
                        ".js-audio-equalizer__frequency-value"
                    ),
                    j = document.querySelector(".js-audio-equalizer__q"),
                    k = document.querySelector(".js-audio-equalizer__q-value"),
                    l = document.querySelector(".js-audio-equalizer__gain"),
                    m = document.querySelector(
                        ".js-audio-equalizer__gain-value"
                    ),
                    n = async (a, b) => {
                        const { algorithm: e, frequency: f, q: g, gain: h } = b;
                        await chrome.runtime.sendMessage({
                            action: c.ACTION_POPUP_BIQUAD_FILTER_CHANGE,
                            target: c.TARGET_SERVICE_WORKER,
                            tabId: a,
                            algorithm: e,
                            frequency: f,
                            q: g,
                            gain: h,
                        }),
                            await d(a);
                    },
                    o = (a, b, c, d) => {
                        (g.value = a),
                            (h.value = b),
                            (i.textContent = b),
                            (j.value = c),
                            (k.textContent = c),
                            (l.value = d),
                            (m.textContent = d);
                    },
                    p = async (a) => {
                        const b = await chrome.runtime.sendMessage({
                            action: c.ACTION_POPUP_AUDIO_DATA_GET,
                            target: c.TARGET_OFFSCREEN_DOCUMENT,
                            tabId: a,
                        });
                        if (b) {
                            const {
                                algorithm: a,
                                frequency: d,
                                q: g,
                                gain: h,
                            } = b.equalizer;
                            o(a, d, g, h);
                            const i = Object.keys(c.EQUALIZER_PRESETS).find(
                                (b) => {
                                    const e = c.EQUALIZER_PRESETS[b];
                                    return (
                                        e.algorithm === a &&
                                        e.frequency === d &&
                                        e.q === g &&
                                        e.gain === h
                                    );
                                }
                            );
                            f.forEach((a) => {
                                a.classList.remove("is-active");
                            });
                            const j = e.querySelector(
                                `[data-equalizer-type="${i}"]`
                            );
                            j
                                ? j.classList.add("is-active")
                                : f[0].classList.add("is-active");
                        }
                    },
                    q = (a) => {
                        g.addEventListener("change", async (b) => {
                            await n(a, { algorithm: b.target.value });
                        }),
                            h.addEventListener("input", async (b) => {
                                await n(a, { frequency: b.target.value });
                            }),
                            j.addEventListener("input", async (b) => {
                                await n(a, { q: b.target.value });
                            }),
                            l.addEventListener("input", async (b) => {
                                await n(a, { gain: b.target.value });
                            }),
                            f.forEach((b) => {
                                b.addEventListener("click", async () => {
                                    f.forEach((a) => {
                                        a.classList.remove("is-active");
                                    }),
                                        b.classList.add("is-active");
                                    const d = b.dataset.equalizerType,
                                        {
                                            algorithm: e,
                                            frequency: g,
                                            q: h,
                                            gain: i,
                                        } = c.EQUALIZER_PRESETS[d];
                                    o(e, g, h, i),
                                        await n(a, {
                                            algorithm: e,
                                            frequency: g,
                                            q: h,
                                            gain: i,
                                        });
                                });
                            });
                    };
                b.exports = {
                    initSliderEqualizerUI: async (a) => {
                        await p(a), q(a);
                    },
                };
            },
            { "./action-reset-ui": 2, "./config": 9 },
        ],
        6: [
            function (a, b) {
                const c = a("./config"),
                    d = a("./utils.js"),
                    { getSliderValues: e, getClosestValue: f } =
                        a("./audio-gain.js"),
                    { renderActionResetUI: g } = a("./action-reset-ui"),
                    { updateActionRestoreUI: h } = a("./action-restore-ui"),
                    i = document.querySelector(c.HTML_JS_HOOK_VOLUME_SLIDER),
                    j = document.querySelector(".js-volume-info__volume-max"),
                    k = document.querySelector(".js-volume-info__volume-value"),
                    l = document.querySelector(".js-actions__restore");
                let m = 0;
                const n = async (a) => {
                        const b = c.VOLUME_VALUE_DEFAULT,
                            d = i.dataset.maxVolume || c.VOLUME_VALUE_MAX,
                            g = e(d);
                        i.setAttribute("min", 0),
                            i.setAttribute("max", g.length - 1);
                        let h = f(g, b);
                        (j.textContent = d),
                            (k.textContent = h),
                            (i.value = g.indexOf(h));
                        const l = await chrome.runtime.sendMessage({
                            action: c.ACTION_POPUP_AUDIO_DATA_GET,
                            target: c.TARGET_OFFSCREEN_DOCUMENT,
                            tabId: a,
                        });
                        if (l) {
                            const a = f(g, 100 * l.gain.gain);
                            (i.value = g.indexOf(a)),
                                (k.textContent = a),
                                i.dispatchEvent(new Event("input")),
                                i.dispatchEvent(new Event("change"));
                        }
                    },
                    o = async (a, b) => {
                        const f = e(i.dataset.maxVolume),
                            h = f[b];
                        (k.textContent = h),
                            await chrome.runtime.sendMessage({
                                action: c.ACTION_POPUP_GAIN_CHANGE,
                                target: c.TARGET_SERVICE_WORKER,
                                tabId: a,
                                volumeValue: h,
                            }),
                            await g(a),
                            d.updateBadge(a, h);
                    },
                    p = (a, b) => {
                        i.addEventListener("input", async (b) => {
                            await o(a, b.target.value),
                                l.classList.add("is-hidden");
                        }),
                            i.addEventListener("wheel", (a) => {
                                a.preventDefault();
                                const b = Date.now();
                                if (!(b - m < 100)) {
                                    const c = Math.sign(a.deltaY);
                                    (i.value = parseInt(i.value, 10) + c),
                                        i.dispatchEvent(new Event("input")),
                                        i.dispatchEvent(new Event("change")),
                                        (m = b);
                                }
                            }),
                            i.addEventListener("change", async () => {
                                await h(b, i.value);
                            });
                    };
                b.exports = {
                    initAudioGainUI: async (a, b) => {
                        await n(a), p(a, b);
                    },
                };
            },
            {
                "./action-reset-ui": 2,
                "./action-restore-ui": 3,
                "./audio-gain.js": 7,
                "./config": 9,
                "./utils.js": 21,
            },
        ],
        7: [
            function (a, b) {
                var c = Math.abs;
                b.exports = {
                    getSliderValues: (a) => {
                        const b = [];
                        for (let c = 0; 10 > c; c++) b.push(c);
                        for (let c = 10; c <= a; c += 10) b.push(c);
                        return b;
                    },
                    getClosestValue: (a, b) =>
                        a.reduce((a, d) => (c(d - b) < c(a - b) ? d : a)),
                };
            },
            {},
        ],
        8: [
            function (a, b) {
                b.exports = {
                    get: async (a, b) => {
                        const c = { [a]: JSON.stringify(b) },
                            d = await chrome.storage.local.get(c);
                        return JSON.parse(d[a]);
                    },
                    set: async (a, b) => {
                        const c = { [a]: JSON.stringify(b) };
                        await chrome.storage.local.set(c);
                    },
                    getBytesInUse: async (a) =>
                        chrome.storage.local.getBytesInUse(a),
                };
            },
            {},
        ],
        9: [
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
        10: [
            function (a, b) {
                const c = a("./chrome/storage-local.js");
                STORAGE_KEY_DARK_MODE = "dark-mode";
                const d = document.querySelector("body"),
                    e = document.querySelector(
                        ".js-switch .js-switch__checkbox"
                    );
                b.exports = {
                    initDarkModeSwitchUI: async () => {
                        const a = await c.get(STORAGE_KEY_DARK_MODE, !1);
                        a && (d.classList.add("dark-mode"), (e.checked = !0)),
                            setTimeout(() => {
                                d.classList.add("animated");
                            }, 300),
                            e.addEventListener("change", async () => {
                                e.checked
                                    ? (d.classList.add("dark-mode"),
                                      await c.set(STORAGE_KEY_DARK_MODE, !0))
                                    : (d.classList.remove("dark-mode"),
                                      await c.set(STORAGE_KEY_DARK_MODE, !1));
                            });
                    },
                };
            },
            { "./chrome/storage-local.js": 8 },
        ],
        11: [
            function (a, b) {
                const c = a("./chrome/storage-local.js"),
                    { STORAGE_KEY_INSTALLATION_DATE: d } =
                        a("./notifications.js"),
                    e = document.querySelector(".js-diagnostics"),
                    f = document.querySelector(".js-diagnostics__cog"),
                    g = document.querySelector(".js-diagnostics__data"),
                    h = document.querySelector(".js-diagnostics__data-encoded"),
                    i = async () => {
                        const a = chrome.runtime.getManifest(),
                            b = await chrome.runtime.getPlatformInfo(),
                            e = await c.get(d, null),
                            f = await c.getBytesInUse(null),
                            i =
                                navigator.userAgentData &&
                                navigator.userAgentData.brands
                                    .map((a) => `${a.brand} ${a.version}`)
                                    .join(", "),
                            j =
                                navigator.userAgentData &&
                                (
                                    await navigator.userAgentData.getHighEntropyValues(
                                        ["fullVersionList"]
                                    )
                                ).fullVersionList
                                    .map((a) => `${a.brand} ${a.version}`)
                                    .join(", "),
                            k = `
    <strong>App ID</strong>: ${chrome.runtime.id}
    <strong>App name</strong>: ${a.name}
    <strong>App version</strong>: ${a.version}
    <strong>Installed</strong>: ${e}
    <strong>Storage used</strong>: ${f} B
    <strong>Platform OS</strong>: ${b.os}
    <strong>Platform arch</strong>: ${b.arch}
    <strong>User agent</strong>: ${navigator.userAgent}
    <strong>UA data</strong>: ${i}
    <strong>UA data - full</strong>: ${j}
    `
                                .split("\n")
                                .map((a) => a.trim())
                                .filter((a) => !!a)
                                .join("\n");
                        g.innerHTML = k;
                        const l = btoa(g.textContent)
                            .replace(/=+$/, "")
                            .split("")
                            .reverse()
                            .join("");
                        h.textContent = l;
                    },
                    j = () => {
                        f &&
                            f.addEventListener("click", () => {
                                e.classList.toggle("is-hidden"),
                                    e.classList.contains("is-hidden") || i();
                            });
                    };
                b.exports = {
                    initDiagnosticsUI: async () => {
                        j();
                    },
                };
            },
            { "./chrome/storage-local.js": 8, "./notifications.js": 15 },
        ],
        12: [
            function (a, b) {
                const c = a("./config"),
                    d = document.querySelector(".js-footer-link");
                b.exports = {
                    initFooterUI: () => {
                        d.setAttribute("href", c.FOOTER_URL);
                    },
                };
            },
            { "./config": 9 },
        ],
        13: [
            function (a, b) {
                const c = a("./config"),
                    { getSliderValues: d, getClosestValue: e } =
                        a("./audio-gain.js"),
                    f = document.querySelector(c.HTML_JS_HOOK_VOLUME_SLIDER);
                b.exports = {
                    initKeyboardShortcuts: () => {
                        document.documentElement.addEventListener(
                            "keypress",
                            (a) => {
                                if (
                                    a.target.classList.contains(
                                        "js-support__code"
                                    )
                                )
                                    return;
                                a.preventDefault();
                                const b = a.key.toLowerCase(),
                                    c = +b;
                                if (!isNaN(c)) {
                                    const a = d(f.dataset.maxVolume),
                                        b = e(a, 100 * c),
                                        g = a[f.min],
                                        h = a[f.max];
                                    if (g <= b && b <= h)
                                        return (
                                            (f.value = a.indexOf(b)),
                                            f.dispatchEvent(new Event("input")),
                                            void f.dispatchEvent(
                                                new Event("change")
                                            )
                                        );
                                }
                                return "d" === b
                                    ? void document
                                          .querySelector(
                                              '[data-equalizer-type="default"]'
                                          )
                                          .click()
                                    : "v" === b
                                    ? void document
                                          .querySelector(
                                              '[data-equalizer-type="voice"]'
                                          )
                                          .click()
                                    : "b" === b
                                    ? void document
                                          .querySelector(
                                              '[data-equalizer-type="bass"]'
                                          )
                                          .click()
                                    : "r" === b
                                    ? void window.location.reload()
                                    : void 0;
                            }
                        );
                    },
                };
            },
            { "./audio-gain.js": 7, "./config": 9 },
        ],
        14: [
            function (a, b) {
                const c = a("./notifications"),
                    d = (a) => {
                        document
                            .querySelector(".js-notification")
                            .classList.add("is-active"),
                            (document.querySelector(
                                ".js-notification__close"
                            ).dataset.id = a.id),
                            (document.querySelector(
                                ".js-notification__title"
                            ).innerHTML = a.title),
                            (document.querySelector(
                                ".js-notification__message"
                            ).innerHTML = a.message);
                    };
                b.exports = {
                    initNotificationsUI: async () => {
                        await c.initNotifications();
                        const a = c.getNotification();
                        a && d(a);
                    },
                };
            },
            { "./notifications": 15 },
        ],
        15: [
            function (a, b) {
                const c = a("./chrome/storage-local.js"),
                    { notifications: d } = a("../config/notifications"),
                    e = "notifications",
                    f = "installation-date",
                    g = {
                        date: new Date(),
                        installationDate: new Date(),
                        usedIds: [],
                    },
                    h = async () => {
                        g.usedIds = await c.get(e, []);
                    },
                    i = async (a) => {
                        g.usedIds.push(a), await c.set(e, g.usedIds);
                    },
                    j = async () => {
                        (g.installationDate = new Date()),
                            await c.set(f, g.installationDate);
                    },
                    k = async () => {
                        const a = await c.get(f, null);
                        a ? (g.installationDate = new Date(a)) : await j();
                    },
                    l = () => {
                        document.addEventListener("click", async (a) => {
                            const b = a.target.closest(
                                ".js-notification__close"
                            );
                            if (b) {
                                const a = b.dataset.id;
                                await i(a),
                                    b
                                        .closest(".notification")
                                        .classList.remove("is-active"),
                                    (document.querySelector(
                                        "html"
                                    ).style.minHeight = "auto");
                            }
                        });
                    };
                b.exports = {
                    initNotifications: async () => {
                        await k(), await h(), l();
                    },
                    getNotification: () => {
                        const a = Math.floor(
                            (g.date - g.installationDate) / 1e3 / 60 / 60 / 23
                        );
                        return d
                            .filter((a) => g.date >= new Date(a.dateFrom))
                            .filter((a) => g.date <= new Date(a.dateTo))
                            .filter((a) => -1 === g.usedIds.indexOf(a.id))
                            .filter((b) => b.minDaysFromInstallation <= a)
                            .filter(
                                (b) =>
                                    null === b.maxDaysFromInstallation ||
                                    a <= b.maxDaysFromInstallation
                            )
                            .sort((c, a) => c.priority - a.priority)
                            .pop();
                    },
                    STORAGE_KEY_INSTALLATION_DATE: f,
                };
            },
            { "../config/notifications": 1, "./chrome/storage-local.js": 8 },
        ],
        16: [
            function (a, b) {
                const c = a("./config"),
                    d = async () => {
                        await chrome.runtime.sendMessage({
                            action: c.ACTION_INIT_OFFSCREEN_DOCUMENT,
                            target: c.TARGET_SERVICE_WORKER,
                        });
                    };
                b.exports = {
                    initOffscreenDocument: async () => {
                        await d();
                    },
                };
            },
            { "./config": 9 },
        ],
        17: [
            function (a, b) {
                const c = document.querySelector(
                        ".js-outdated-browsers-manager"
                    ),
                    d = (a) => {
                        const b = /Chrome\/(\d+)/,
                            c = a.match(b);
                        return c ? c[1] : null;
                    },
                    e = async () => {
                        const a = navigator.userAgent,
                            b = d(a);
                        b && b < 116 && c.classList.remove("is-hidden");
                    };
                b.exports = {
                    initOutdatedBrowsersManagerUI: async () => {
                        await e();
                    },
                };
            },
            {},
        ],
        18: [
            function (a, b) {
                const c = a("./config"),
                    d = {
                        support: c.ISSUE_URL,
                        review: c.getStoreReviewsUrl(),
                    },
                    e = document.querySelectorAll(
                        ".stars .stars__star-wrapper"
                    );
                b.exports = {
                    initStarsUI: () => {
                        e.forEach((a) => {
                            const b = a.dataset.action,
                                c = d[b];
                            a.setAttribute("href", c);
                        });
                    },
                };
            },
            { "./config": 9 },
        ],
        19: [
            function (a, b) {
                const c = a("./config"),
                    d = a("./chrome/storage-local.js"),
                    e = "is-premium",
                    f = document.querySelector(c.HTML_JS_HOOK_VOLUME_SLIDER),
                    g = document.querySelector(".js-heart"),
                    h = document.querySelector(".js-support"),
                    i = document.querySelector(".js-support__code"),
                    j = document.querySelector(".js-support__activate"),
                    k = document.querySelector(".js-support__thankyou"),
                    l = document.querySelector(".js-support__invalid-code"),
                    m = async () => {
                        await d.set(e, !0);
                    },
                    n = () => {
                        f.dataset.maxVolume = 800;
                    };
                g.addEventListener("click", () => {
                    h.classList.toggle("is-hidden");
                }),
                    j.addEventListener("click", async () => {
                        const a = i.value,
                            b = btoa(a);
                        "SUxJS0VJVExPVUQ4MDA=" === b
                            ? (k.classList.remove("is-hidden"),
                              l.classList.add("is-hidden"),
                              await m(),
                              n())
                            : (l.classList.remove("is-hidden"),
                              k.classList.add("is-hidden"));
                    }),
                    (b.exports = {
                        initSupporterUI: n,
                        loadIsSupporter: async () => await d.get(e, !1),
                    });
            },
            { "./chrome/storage-local.js": 8, "./config": 9 },
        ],
        20: [
            function (a, b) {
                const c = document.querySelector(".js-tabs__title"),
                    d = document.querySelector(".js-tabs__list"),
                    e = async () => {
                        const a = await chrome.tabs.query({ audible: !0 });
                        a.sort((c, a) => a.id - c.id),
                            0 < a.length
                                ? ((c.textContent =
                                      "Tabs playing audio right now"),
                                  d.classList.add("tabs__list--active"))
                                : ((c.textContent =
                                      "No tabs playing audio right now"),
                                  d.classList.remove("tabs__list--active")),
                            a.forEach((a) => {
                                const b =
                                    document.querySelector(
                                        ".js-template-tab"
                                    ).content;
                                (b.querySelector(".js-tab").dataset.tabId =
                                    a.id),
                                    (b.querySelector(
                                        ".js-tab__icon-image"
                                    ).src = a.favIconUrl),
                                    (b.querySelector(
                                        ".js-tab__title"
                                    ).textContent = a.title),
                                    d.appendChild(document.importNode(b, !0));
                            });
                    },
                    f = () => {
                        d.addEventListener("click", async (a) => {
                            a.preventDefault();
                            const b = a.target,
                                c = b.closest(".tab"),
                                d = parseInt(c.dataset.tabId, 10),
                                e = await chrome.tabs.update(d, { active: !0 });
                            await chrome.windows.update(e.windowId, {
                                focused: !0,
                            });
                        });
                    };
                b.exports = {
                    initTabsUI: async () => {
                        await e(), f();
                    },
                };
            },
            {},
        ],
        21: [
            function (a, b) {
                b.exports = {
                    updateBadge: (a, b) => {
                        chrome.action.setBadgeText({ text: `${b}`, tabId: a });
                    },
                };
            },
            {},
        ],
        22: [
            function (a) {
                const { initFooterUI: b } = a("./modules/footer-ui"),
                    { initKeyboardShortcuts: c } = a(
                        "./modules/keyboard-shortcuts"
                    ),
                    { initNotificationsUI: d } = a(
                        "./modules/notifications-ui"
                    ),
                    { initStarsUI: e } = a("./modules/stars-ui"),
                    { initSupporterUI: f, loadIsSupporter: g } = a(
                        "./modules/supporter-ui"
                    ),
                    { initTabsUI: h } = a("./modules/tabs-ui"),
                    { initAudioGainUI: i } = a("./modules/audio-gain-ui.js"),
                    { initDarkModeSwitchUI: j } = a(
                        "./modules/dark-mode-switch-ui"
                    ),
                    { initActionResetUI: k } = a("./modules/action-reset-ui"),
                    { initActionRestoreUI: l } = a(
                        "./modules/action-restore-ui"
                    ),
                    { initSliderEqualizerUI: m } = a(
                        "./modules/audio-equalizer-ui.js"
                    ),
                    { initAnalyserUI: n } = a("./modules/audio-analyser-ui.js"),
                    { initOffscreenDocument: o } = a(
                        "./modules/offscreen-document.js"
                    ),
                    { initDiagnosticsUI: p } = a("./modules/diagnostics-ui.js"),
                    { initOutdatedBrowsersManagerUI: q } = a(
                        "./modules/outdated-browsers-manager-ui.js"
                    );
                (async () => {
                    const a = await chrome.tabs.query({
                            active: !0,
                            currentWindow: !0,
                        }),
                        r = a[0].id,
                        s = a[0].url,
                        t = await g();
                    t && f(),
                        await j(),
                        await d(),
                        await o(),
                        await i(r, s),
                        await m(r),
                        await n(r),
                        await l(r, s),
                        await k(r),
                        await h(),
                        b(),
                        e(),
                        await p(),
                        await q(),
                        c();
                })();
            },
            {
                "./modules/action-reset-ui": 2,
                "./modules/action-restore-ui": 3,
                "./modules/audio-analyser-ui.js": 4,
                "./modules/audio-equalizer-ui.js": 5,
                "./modules/audio-gain-ui.js": 6,
                "./modules/dark-mode-switch-ui": 10,
                "./modules/diagnostics-ui.js": 11,
                "./modules/footer-ui": 12,
                "./modules/keyboard-shortcuts": 13,
                "./modules/notifications-ui": 14,
                "./modules/offscreen-document.js": 16,
                "./modules/outdated-browsers-manager-ui.js": 17,
                "./modules/stars-ui": 18,
                "./modules/supporter-ui": 19,
                "./modules/tabs-ui": 20,
            },
        ],
    },
    {},
    [22]
);
