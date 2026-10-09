/*
 * Preset Formatting — SillyTavern UI extension
 *
 * Lets a Chat Completion preset carry its own response formatting:
 *   • Reasoning Template (+ Auto-Parse)
 *   • Start Reply With
 *   • Custom Stopping Strings
 *   • Regex Preset (which regex scripts are on)
 * and can keep character (scoped) / preset-embedded regex scripts switched on,
 * which a Regex Preset would otherwise switch off on every other card or preset.
 * The values live inside the preset file (preset.extensions.presetFormatting),
 * so they follow the preset when it is selected, renamed, "saved as" or exported.
 *
 * With formatting moved into presets, connection profiles only need to hold the
 * connection itself (source, endpoint, key, model, post-processing). To make that
 * pairing quick, a preset dropdown is added next to the connection dropdown of
 * the Chat Top Info Bar extension.
 *
 * A chat can also be locked to a preset (chat_metadata.presetFormatting.lockedPreset):
 * opening the chat switches to that preset and leaves the connection alone.
 */

const MODULE = 'preset_formatting';
const FIELD = 'presetFormatting';
const LOG = '[PresetFormatting]';
const VERSION = '1.4.0'; // keep in sync with manifest.json
const BASE_URL = new URL('.', import.meta.url);

const DEFAULTS = Object.freeze({
    enabled: true,
    topBar: true,
    hideStatusNarrow: true,
    notify: true,
    lastCleanup: null,
    scopedAlwaysOn: true,
    presetScriptsAlwaysOn: false,
    chatLock: true,
});

/** What a preset can carry, and the SillyTavern control each one drives. */
const FORMAT_FIELDS = Object.freeze({
    reasoningTemplate: { label: 'Reasoning Template', short: 'Reasoning' },
    autoParse: { label: 'Auto-Parse (reasoning)', short: 'Auto-Parse' },
    startReplyWith: { label: 'Start Reply With', short: 'Start Reply' },
    stopStrings: { label: 'Custom Stopping Strings', short: 'Stop' },
    regexPreset: { label: 'Regex Preset', short: 'Regex' },
});

/** Connection profile fields that would override what the preset sets. */
const PROFILE_FIELDS = Object.freeze({
    'reasoning-template': { label: 'Reasoning Template', checked: true },
    'start-reply-with': { label: 'Start Reply With', checked: true },
    'stop-strings': { label: 'Custom Stopping Strings', checked: false },
    'regex-preset': { label: 'Regex Preset', checked: true },
    'preset': { label: 'Settings Preset', checked: false },
});

// ---------------------------------------------------------------- helpers

const ctx = () => SillyTavern.getContext();
const $id = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function settings() {
    const ext = ctx().extensionSettings;
    if (!ext[MODULE]) ext[MODULE] = {};
    const s = ext[MODULE];
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (s[k] === undefined) s[k] = v;
    }
    return s;
}

const save = () => ctx().saveSettingsDebounced();

const toast = {
    info: m => globalThis.toastr?.info(m, 'Preset Formatting'),
    ok: m => globalThis.toastr?.success(m, 'Preset Formatting'),
    warn: m => globalThis.toastr?.warning(m, 'Preset Formatting'),
};

function debounce(fn, ms) {
    let t = null;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const isChatCompletion = () => ctx().mainApi === 'openai';
const presetManager = () => ctx().getPresetManager?.('openai') ?? null;
const presetSelect = () => /** @type {HTMLSelectElement|null} */ ($id('settings_preset_openai'));
const currentPresetName = () => presetManager()?.getSelectedPresetName() ?? '';

// ---------------------------------------------------------------- stored format

/** Keep only known, well-typed fields. A missing field means "leave it as it is". */
function normalize(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    if (typeof raw.reasoningTemplate === 'string' && raw.reasoningTemplate) out.reasoningTemplate = raw.reasoningTemplate;
    if (typeof raw.autoParse === 'boolean') out.autoParse = raw.autoParse;
    if (typeof raw.startReplyWith === 'string') out.startReplyWith = raw.startReplyWith;
    if (typeof raw.stopStrings === 'string') out.stopStrings = raw.stopStrings;
    if (typeof raw.regexPreset === 'string' && raw.regexPreset) {
        out.regexPreset = raw.regexPreset;
        // The name is kept too: ids differ on another install, so a shared preset falls back to the name.
        if (typeof raw.regexPresetName === 'string' && raw.regexPresetName) out.regexPresetName = raw.regexPresetName;
    }
    return out;
}

function readFormat(name = currentPresetName()) {
    try {
        return normalize(presetManager()?.readPresetExtensionField({ name, path: FIELD }));
    } catch (e) {
        console.warn(LOG, 'read failed', e);
        return {};
    }
}

async function writeFormat(fmt) {
    const pm = presetManager();
    if (!pm) return;
    const clean = normalize(fmt);
    try {
        // Saves into the current settings AND the preset file, no need to press "Update preset".
        await pm.writePresetExtensionField({ path: FIELD, value: Object.keys(clean).length ? clean : null });
    } catch (e) {
        console.error(LOG, 'write failed', e);
        toast.warn('บันทึกลง preset ไม่สำเร็จ ดู console');
    }
}

// ---------------------------------------------------------------- live values (what SillyTavern is using now)

const live = {
    reasoningTemplate: () => String($id('reasoning_select')?.value ?? ''),
    autoParse: () => !!(/** @type {HTMLInputElement} */ ($id('reasoning_auto_parse'))?.checked),
    startReplyWith: () => String(/** @type {HTMLTextAreaElement} */ ($id('start_reply_with'))?.value ?? ''),
    stopStrings: () => String(/** @type {HTMLTextAreaElement} */ ($id('custom_stopping_strings'))?.value ?? ''),
    regexPreset: () => String(/** @type {HTMLSelectElement} */ ($id('regex_presets'))?.value ?? ''),
};

/** Regex presets saved in the Regex extension: [{ id, name, ... }] */
const regexPresets = () => (Array.isArray(ctx().extensionSettings.regex_presets) ? ctx().extensionSettings.regex_presets : []);
const hasRegexPresets = () => !!$id('regex_presets');

/** Find the stored regex preset by id, or by name when the id is unknown here. */
function findRegexPreset(fmt) {
    const list = regexPresets();
    return list.find(p => p.id === fmt.regexPreset)
        ?? (fmt.regexPresetName ? list.find(p => p.name === fmt.regexPresetName) : null)
        ?? null;
}

const reasoningTemplateNames = () => [...($id('reasoning_select')?.options ?? [])].map(o => o.value).filter(Boolean);

/**
 * Push a format into SillyTavern's own controls (their handlers update power_user and save).
 * @returns {string[]} labels of what was set
 */
function applyFormat(fmt) {
    const done = [];
    if (fmt.reasoningTemplate !== undefined) {
        if (!reasoningTemplateNames().includes(fmt.reasoningTemplate)) {
            toast.warn(`ไม่พบ Reasoning Template “${esc(fmt.reasoningTemplate)}” (ถูกลบหรือเปลี่ยนชื่อ?)`);
        } else {
            if (live.reasoningTemplate() !== fmt.reasoningTemplate) $('#reasoning_select').val(fmt.reasoningTemplate).trigger('change');
            done.push(fmt.reasoningTemplate);
        }
    }
    if (fmt.autoParse !== undefined) {
        if (live.autoParse() !== fmt.autoParse) $('#reasoning_auto_parse').prop('checked', fmt.autoParse).trigger('change');
        done.push(`Auto-Parse ${fmt.autoParse ? 'เปิด' : 'ปิด'}`);
    }
    if (fmt.startReplyWith !== undefined) {
        if (live.startReplyWith() !== fmt.startReplyWith) $('#start_reply_with').val(fmt.startReplyWith).trigger('input');
        done.push(fmt.startReplyWith ? 'Start Reply With' : 'Start Reply With (ว่าง)');
    }
    if (fmt.stopStrings !== undefined) {
        if (live.stopStrings() !== fmt.stopStrings) $('#custom_stopping_strings').val(fmt.stopStrings).trigger('input');
        done.push('Stop Strings');
    }
    if (fmt.regexPreset !== undefined && hasRegexPresets()) {
        const rp = findRegexPreset(fmt);
        const cmd = ctx().SlashCommandParser?.commands?.['regex-preset'];
        if (!rp) {
            toast.warn(`ไม่พบ Regex Preset “${esc(fmt.regexPresetName ?? fmt.regexPreset)}” (ถูกลบหรือเปลี่ยนชื่อ?)`);
        } else if (cmd) {
            // Re-applied on every switch, like a connection profile does: the regex preset also decides
            // which of the newly selected preset's own regex scripts are on.
            Promise.resolve(cmd.callback({ quiet: 'true' }, rp.id)).catch(err => console.error(LOG, 'regex preset', err));
            done.push(`Regex: ${rp.name}`);
        }
    }
    return done;
}

function summaryOf(fmt) {
    const parts = [];
    if (fmt.reasoningTemplate !== undefined) parts.push(fmt.reasoningTemplate);
    if (fmt.autoParse !== undefined) parts.push(`Auto-Parse ${fmt.autoParse ? 'เปิด' : 'ปิด'}`);
    if (fmt.startReplyWith !== undefined) parts.push(FORMAT_FIELDS.startReplyWith.short);
    if (fmt.stopStrings !== undefined) parts.push(FORMAT_FIELDS.stopStrings.short);
    if (fmt.regexPreset !== undefined) parts.push(`Regex: ${findRegexPreset(fmt)?.name ?? fmt.regexPresetName ?? '?'}`);
    return parts.join(' · ');
}

// ---------------------------------------------------------------- preset change

async function onPresetChanged(e) {
    if (e?.apiId && e.apiId !== 'openai') return;
    syncTopBar();
    syncLockUi();
    renderEditor();
    if (!settings().enabled) return;
    const name = e?.name ?? currentPresetName();
    const fmt = readFormat(name);
    if (!Object.keys(fmt).length) return;
    const done = applyFormat(fmt);
    if (done.length && settings().notify) toast.info(`${esc(name)} → ${esc(done.join(' · '))}`);
}

// ---------------------------------------------------------------- editor under the preset dropdown

let editor = null;
let editorBusy = false; // true while we fill the editor from data, so its change handlers stay quiet

function buildEditor() {
    if (editor?.isConnected) return true;
    const row = presetSelect()?.closest('.flex-container');
    if (!row) return false;

    editor = document.createElement('div');
    editor.id = 'pf_editor';
    editor.className = 'inline-drawer pf_editor';
    editor.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header pf_head">
            <span class="pf_title"><i class="fa-solid fa-brain"></i> <b>รูปแบบประจำ preset</b></span>
            <small id="pf_summary" class="pf_summary"></small>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <small class="pf_note">ติ๊กค่าที่ preset นี้ต้องใช้ — ทุกครั้งที่เลือก preset นี้ ค่าที่ติ๊กจะถูกตั้งให้อัตโนมัติ ที่ไม่ติ๊กจะไม่ถูกแตะ · บันทึกลงไฟล์ preset ทันที ไม่ต้องกด Update</small>
            <div class="pf_row" data-f="reasoningTemplate">
                <label class="checkbox_label"><input type="checkbox" class="pf_on"> Reasoning Template</label>
                <select id="pf_reasoning" class="text_pole pf_val"></select>
            </div>
            <div class="pf_row" data-f="autoParse">
                <label class="checkbox_label"><input type="checkbox" class="pf_on"> Auto-Parse</label>
                <select id="pf_autoparse" class="text_pole pf_val">
                    <option value="true">เปิด — แยกส่วนคิดออกจากคำตอบ</option>
                    <option value="false">ปิด</option>
                </select>
            </div>
            <div class="pf_row pf_row_text" data-f="startReplyWith">
                <label class="checkbox_label"><input type="checkbox" class="pf_on"> Start Reply With</label>
                <textarea id="pf_startreply" class="text_pole textarea_compact pf_val" rows="2" placeholder="(ว่าง = ล้างค่า Start Reply With)"></textarea>
            </div>
            <div class="pf_row pf_row_text" data-f="stopStrings">
                <label class="checkbox_label"><input type="checkbox" class="pf_on"> Stop Strings</label>
                <textarea id="pf_stop" class="text_pole textarea_compact pf_val" rows="2" placeholder='["\\n{{user}}:"]'></textarea>
            </div>
            <div class="pf_row" data-f="regexPreset">
                <label class="checkbox_label"><input type="checkbox" class="pf_on"> Regex Preset</label>
                <select id="pf_regexpreset" class="text_pole pf_val"></select>
            </div>
            <div class="pf_btns">
                <div id="pf_capture" class="menu_button" title="ติ๊กทุกช่องแล้วใส่ค่าที่ SillyTavern ใช้อยู่ตอนนี้"><i class="fa-solid fa-camera"></i> ดึงค่าที่ใช้อยู่</div>
                <div id="pf_clear" class="menu_button" title="เลิกให้ preset นี้กำหนดค่าใด ๆ"><i class="fa-solid fa-eraser"></i> ล้าง</div>
            </div>
            <small id="pf_editor_warn" class="pf_warn"></small>
        </div>`;
    row.insertAdjacentElement('afterend', editor);

    editor.querySelectorAll('.pf_row').forEach(r => {
        const f = r.dataset.f;
        const on = /** @type {HTMLInputElement} */ (r.querySelector('.pf_on'));
        const val = /** @type {HTMLInputElement} */ (r.querySelector('.pf_val'));
        on.addEventListener('change', () => {
            if (editorBusy) return;
            if (on.checked) setValueInput(f, val, live[f]()); // start from what is in use now
            commitEditor({ applyField: on.checked ? f : null });
        });
        const onValue = () => { if (!editorBusy && on.checked) commitEditor({ applyField: f }); };
        if (val.tagName === 'TEXTAREA') {
            const commitSoon = debounce(onValue, 500);
            val.addEventListener('input', () => { validateStop(); commitSoon(); });
            val.addEventListener('blur', onValue);
        } else {
            val.addEventListener('change', onValue);
        }
    });
    $id('pf_capture').addEventListener('click', () => {
        const fmt = {};
        for (const f of Object.keys(FORMAT_FIELDS)) fmt[f] = live[f]();
        if (!fmt.reasoningTemplate) delete fmt.reasoningTemplate;
        fmt.regexPresetName = regexPresets().find(p => p.id === fmt.regexPreset)?.name;
        if (!fmt.regexPresetName) delete fmt.regexPreset; // no regex presets saved yet
        fillEditor(normalize(fmt));
        commitEditor({});
        toast.ok(`จำค่าปัจจุบันไว้ใน “${esc(currentPresetName())}” แล้ว`);
    });
    $id('pf_clear').addEventListener('click', () => {
        fillEditor({});
        commitEditor({});
    });

    // Keep the template list in step with SillyTavern's (templates can be added/renamed/deleted).
    const rs = $id('reasoning_select');
    if (rs) new MutationObserver(() => renderEditor()).observe(rs, { childList: true });
    return true;
}

function setValueInput(f, el, v) {
    if (f === 'autoParse') el.value = v ? 'true' : 'false';
    else el.value = String(v ?? '');
    if (el.tagName === 'TEXTAREA') autoHeight(el);
}

function autoHeight(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(200, el.scrollHeight + 2)}px`;
}

/** Editor → stored format. */
function editorFormat() {
    const fmt = {};
    editor.querySelectorAll('.pf_row').forEach(r => {
        const f = r.dataset.f;
        if (!r.querySelector('.pf_on').checked) return;
        const v = r.querySelector('.pf_val').value;
        fmt[f] = f === 'autoParse' ? v === 'true' : v;
    });
    if (fmt.regexPreset) fmt.regexPresetName = regexPresets().find(p => p.id === fmt.regexPreset)?.name ?? readFormat().regexPresetName;
    return normalize(fmt);
}

/** Stored format → editor. */
function fillEditor(fmt) {
    editorBusy = true;
    try {
        const sel = /** @type {HTMLSelectElement} */ ($id('pf_reasoning'));
        const names = reasoningTemplateNames();
        const wanted = fmt.reasoningTemplate;
        const list = wanted && !names.includes(wanted) ? [...names, wanted] : names;
        sel.innerHTML = list.map(n => `<option value="${esc(n)}">${esc(n)}${names.includes(n) ? '' : ' (หาไม่พบ)'}</option>`).join('');

        // Regex presets: show by name, store by id. A stored one that no longer exists stays visible as "(หาไม่พบ)".
        const rsel = /** @type {HTMLSelectElement} */ ($id('pf_regexpreset'));
        const found = fmt.regexPreset !== undefined ? findRegexPreset(fmt) : null;
        if (found) fmt = { ...fmt, regexPreset: found.id };
        const opts = regexPresets().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`);
        if (fmt.regexPreset !== undefined && !found) opts.push(`<option value="${esc(fmt.regexPreset)}">${esc(fmt.regexPresetName ?? fmt.regexPreset)} (หาไม่พบ)</option>`);
        rsel.innerHTML = opts.join('') || '<option value="">(ยังไม่มี Regex Preset)</option>';
        rsel.closest('.pf_row').hidden = !hasRegexPresets();

        editor.querySelectorAll('.pf_row').forEach(r => {
            const f = r.dataset.f;
            const has = fmt[f] !== undefined;
            r.querySelector('.pf_on').checked = has;
            r.classList.toggle('pf_off', !has);
            setValueInput(f, r.querySelector('.pf_val'), has ? fmt[f] : live[f]());
        });
    } finally {
        editorBusy = false;
    }
    validateStop();
    $id('pf_summary').textContent = summaryOf(fmt) || 'ไม่ได้กำหนด';
}

async function commitEditor({ applyField = null }) {
    const fmt = editorFormat();
    editor.querySelectorAll('.pf_row').forEach(r => r.classList.toggle('pf_off', fmt[r.dataset.f] === undefined));
    $id('pf_summary').textContent = summaryOf(fmt) || 'ไม่ได้กำหนด';
    // Make what you see what is in use: the edited preset is the selected one.
    if (settings().enabled) {
        if (applyField && fmt[applyField] !== undefined) applyFormat({ [applyField]: fmt[applyField] });
        else if (!applyField) applyFormat(fmt);
    }
    await writeFormat(fmt);
}

function validateStop() {
    const el = /** @type {HTMLTextAreaElement} */ ($id('pf_stop'));
    const warn = $id('pf_editor_warn');
    if (!el || !warn) return;
    const on = el.closest('.pf_row').querySelector('.pf_on').checked;
    let bad = false;
    if (on && el.value.trim()) {
        try { bad = !Array.isArray(JSON.parse(el.value)); } catch { bad = true; }
    }
    el.classList.toggle('pf_bad', bad);
    warn.textContent = bad ? 'Stopping Strings ต้องเป็น JSON array เช่น ["\\n{{user}}:"]' : '';
}

let regexListObserved = false;

function renderEditor() {
    if (!buildEditor()) return;
    // The Regex extension builds its preset list later than we start; watch it once it exists.
    const rp = $id('regex_presets');
    if (rp && !regexListObserved) {
        regexListObserved = true;
        new MutationObserver(() => renderEditor()).observe(rp, { childList: true });
    }
    fillEditor(readFormat());
}

// ---------------------------------------------------------------- preset dropdown in the Chat Top Info Bar

let tbIcon = null;
let tbSelect = null;
let tbLock = null;

function buildTopBar() {
    const host = $id('extensionConnectionProfiles');
    if (!host) return false;
    if (!tbSelect) {
        tbIcon = document.createElement('i');
        tbIcon.id = 'pf_tb_icon';
        tbIcon.className = 'fa-fw fa-solid fa-sliders';
        tbIcon.title = 'Chat Completion preset';
        tbSelect = document.createElement('select');
        tbSelect.id = 'pf_tb_preset';
        tbSelect.title = 'สลับ Chat Completion preset';
        tbSelect.addEventListener('change', async () => {
            const pm = presetManager();
            if (!pm || !tbSelect.value) return;
            await pm.selectPreset(tbSelect.value);
        });
        tbLock = document.createElement('i');
        tbLock.id = 'pf_tb_lock';
        tbLock.className = 'fa-fw fa-solid fa-thumbtack';
        tbLock.setAttribute('role', 'button');
        tbLock.tabIndex = 0;
        tbLock.addEventListener('click', () => toggleChatLock());
        tbLock.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChatLock(); } });
    }
    if (!host.contains(tbSelect)) host.prepend(tbIcon, tbSelect, tbLock);
    syncTopBar();
    return true;
}

function syncTopBar() {
    if (!tbSelect) return;
    const main = presetSelect();
    const show = !!settings().topBar && !!main && isChatCompletion();
    tbSelect.hidden = !show;
    tbIcon.hidden = !show;
    tbSelect.closest('#extensionConnectionProfiles')?.classList.toggle('pf_has_preset', show);
    syncLockUi();
    if (!show) return;
    if (tbSelect.innerHTML !== main.innerHTML) tbSelect.innerHTML = main.innerHTML;
    tbSelect.value = main.value;
    const name = main.selectedOptions[0]?.textContent ?? '';
    const fmt = readFormat(name);
    tbSelect.title = `Preset: ${name}${Object.keys(fmt).length ? `\nรูปแบบ: ${summaryOf(fmt)}` : ''}`;
}

function watchForTopBar() {
    if (buildTopBar()) return;
    const obs = new MutationObserver(() => { if (buildTopBar()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 60000); // Top Info Bar not installed — stop looking
}

function applyBodyClasses() {
    const s = settings();
    document.body.classList.toggle('pf_hide_status_narrow', !!s.hideStatusNarrow);
}

// ---------------------------------------------------------------- per-chat preset lock

/*
 * chat_metadata.presetFormatting.lockedPreset holds the preset a chat is locked to. Opening the chat
 * (or reloading it) switches to that preset; the connection profile is not touched. The lock stays
 * put when the preset is changed by hand, until it is re-locked or unlocked. Branches copy
 * chat_metadata, so a branch starts with its parent's lock (Alternate Universe re-points it).
 */

const hasChat = () => !!ctx().chatId;

function chatLock() {
    const v = ctx().chatMetadata?.[FIELD]?.lockedPreset;
    return typeof v === 'string' ? v : '';
}

/** @param {string} name preset to lock the open chat to, '' to unlock */
async function setChatLock(name) {
    const c = ctx();
    if (!c.chatId || !c.chatMetadata) return false;
    const meta = c.chatMetadata;
    if (name) {
        meta[FIELD] = { ...(meta[FIELD] ?? {}), lockedPreset: name };
    } else if (meta[FIELD]) {
        delete meta[FIELD].lockedPreset;
        if (!Object.keys(meta[FIELD]).length) delete meta[FIELD];
    }
    await c.saveMetadata();
    syncLockUi();
    return true;
}

async function toggleChatLock() {
    if (!hasChat()) return toast.info('เปิดแชทก่อน');
    if (!isChatCompletion()) return toast.info('ล็อก preset ใช้ได้กับ Chat Completion เท่านั้น');
    const cur = currentPresetName();
    if (chatLock() && chatLock() === cur) {
        await setChatLock('');
        toast.info('ปลดล็อก preset ของแชทนี้แล้ว');
    } else {
        await setChatLock(cur);
        toast.ok(`ล็อก “${esc(cur)}” ไว้กับแชทนี้แล้ว`);
    }
}

let lockWarned = '';

/** Switch to the open chat's locked preset, if it has one and it is not already selected. */
async function applyChatLock() {
    syncLockUi();
    if (!settings().chatLock || !isChatCompletion()) return;
    const name = chatLock();
    if (!name || name === currentPresetName()) return;
    const pm = presetManager();
    const value = pm?.findPreset(name);
    if (value === undefined || value === null) {
        const key = `${ctx().chatId}|${name}`;
        if (lockWarned !== key) {
            lockWarned = key;
            toast.warn(`แชทนี้ล็อกไว้กับ preset “${esc(name)}” แต่หา preset นี้ไม่พบ (ถูกลบหรือเปลี่ยนชื่อ?)`);
        }
        return;
    }
    console.log(LOG, 'chat lock →', name);
    await pm.selectPreset(value);
}

// A chat reload (Regex Preset, other extensions) fires CHAT_CHANGED again; coalesce the bursts.
const applyChatLockSoon = debounce(() => applyChatLock().catch(e => console.error(LOG, 'chat lock', e)), 150);

/** Character Locks (STCL) also switches presets per chat; with both on, they undo each other. */
const stclChatMemory = () => !!ctx().extensionSettings.STCL?.moduleSettings?.enableChatMemory;

function lockState() {
    const lock = chatLock();
    const cur = currentPresetName();
    if (!lock) return { cls: 'pf_lock_off', title: `ล็อก “${cur}” ไว้กับแชทนี้`, text: 'แชทนี้ไม่ได้ล็อก preset' };
    if (lock === cur) return { cls: 'pf_lock_on', title: `แชทนี้ล็อกไว้กับ “${lock}” · แตะเพื่อปลดล็อก`, text: `แชทนี้ล็อกไว้กับ <b>${esc(lock)}</b>` };
    return {
        cls: 'pf_lock_diff',
        title: `แชทนี้ล็อกไว้กับ “${lock}” แต่ตอนนี้ใช้ “${cur}” · แตะเพื่อล็อกเป็น “${cur}”`,
        text: `แชทนี้ล็อกไว้กับ <b>${esc(lock)}</b> แต่ตอนนี้ใช้ <b>${esc(cur)}</b>`,
    };
}

function syncLockUi() {
    const show = !!settings().chatLock && hasChat() && isChatCompletion();
    const st = show ? lockState() : null;
    if (tbLock) {
        tbLock.hidden = !show || !!tbSelect?.hidden;
        tbLock.classList.remove('pf_lock_off', 'pf_lock_on', 'pf_lock_diff');
        if (st) {
            tbLock.classList.add(st.cls);
            tbLock.title = st.title;
        }
    }
    const row = $id('pf_lock_row');
    if (row) {
        row.hidden = !show;
        if (st) {
            $id('pf_lock_state').innerHTML = st.text;
            $id('pf_lock_toggle').innerHTML = st.cls === 'pf_lock_on'
                ? '<i class="fa-solid fa-lock-open"></i> ปลดล็อก'
                : `<i class="fa-solid fa-thumbtack"></i> ล็อก ${esc(currentPresetName())}`;
        }
    }
    const warn = $id('pf_lock_stcl');
    if (warn) warn.hidden = !(settings().chatLock && stclChatMemory());
}

function registerCommands() {
    const { SlashCommandParser, SlashCommand } = ctx();
    if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'preset-lock',
        callback: async (_args, value) => {
            const arg = String(value ?? '').trim();
            if (!hasChat()) { toast.info('เปิดแชทก่อน'); return ''; }
            if (arg === 'off') { await setChatLock(''); return ''; }
            if (arg === '?') return chatLock();
            const name = arg || currentPresetName();
            if (presetManager()?.findPreset(name) == null) { toast.warn(`ไม่พบ preset “${esc(name)}”`); return ''; }
            await setChatLock(name);
            await applyChatLock();
            return name;
        },
        helpString: 'ล็อก Chat Completion preset ไว้กับแชทนี้ เปิดแชทนี้เมื่อไหร่จะสลับไป preset นั้นให้ (connection ไม่เปลี่ยน) · ไม่ใส่ชื่อ = preset ที่ใช้อยู่ · <code>off</code> = ปลดล็อก · <code>?</code> = บอกชื่อ preset ที่ล็อกไว้',
    }));
}

// ---------------------------------------------------------------- keep regex scripts switched on

/*
 * A Regex Preset (applied by us, by a connection profile or from the Regex panel) switches OFF every
 * script missing from its snapshot. Its snapshot of character (scoped) and preset-embedded scripts only
 * knows the character / preset it was saved with, so on any other card or preset those scripts go off —
 * and stay off, since the flag is written into the card / preset file. Here they are switched back on.
 * Applying a Regex Preset always ends with a chat reload (CHAT_CHANGED), which is when we check.
 */

let enforcing = false;

const allOn = scripts => scripts.map(x => (x?.disabled ? { ...x, disabled: false } : x));
const anyOff = scripts => Array.isArray(scripts) && scripts.some(x => x?.disabled);

async function enforceRegexOn() {
    const s = settings();
    if (enforcing || (!s.scopedAlwaysOn && !s.presetScriptsAlwaysOn)) return;
    const c = ctx();
    enforcing = true;
    const turnedOn = [];
    try {
        if (s.scopedAlwaysOn && c.characterId !== undefined && c.characterId !== null && !c.groupId) {
            const scripts = c.characters?.[c.characterId]?.data?.extensions?.regex_scripts;
            if (anyOff(scripts)) {
                await c.writeExtensionField(c.characterId, 'regex_scripts', allOn(scripts));
                turnedOn.push(`scoped ${scripts.filter(x => x?.disabled).length}`);
            }
        }
        const pm = presetManager();
        if (s.presetScriptsAlwaysOn && pm && isChatCompletion()) {
            const scripts = pm.readPresetExtensionField({ path: 'regex_scripts' });
            if (anyOff(scripts)) {
                await pm.writePresetExtensionField({ path: 'regex_scripts', value: allOn(scripts) });
                turnedOn.push(`preset ${scripts.filter(x => x?.disabled).length}`);
            }
        }
        if (turnedOn.length) {
            console.log(LOG, 'regex scripts switched back on:', turnedOn.join(', '));
            await c.reloadCurrentChat(); // re-render with the scripts on; also refreshes the Regex panel
        }
    } catch (e) {
        console.error(LOG, 'could not switch regex scripts on', e);
    } finally {
        enforcing = false;
    }
}

const enforceRegexOnSoon = debounce(enforceRegexOn, 400);

// ---------------------------------------------------------------- connection profile clean-up

const ccProfiles = () => (ctx().extensionSettings.connectionManager?.profiles ?? []).filter(p => p.mode === 'cc');

function profileFieldCounts() {
    const counts = {};
    for (const f of Object.keys(PROFILE_FIELDS)) counts[f] = ccProfiles().filter(p => p[f] !== undefined).length;
    return counts;
}

async function cleanProfiles(fields) {
    const targets = ccProfiles().filter(p => fields.some(f => p[f] !== undefined || !(p.exclude ?? []).includes(f)));
    if (!targets.length) return;
    const withValues = ccProfiles().filter(p => fields.some(f => p[f] !== undefined));
    const names = fields.map(f => PROFILE_FIELDS[f].label).join(', ');
    const ok = await ctx().Popup.show.confirm(
        'เอาค่าออกจาก connection profile',
        `จะลบ <b>${esc(names)}</b> ออกจาก Chat Completion profile ทั้งหมด (${withValues.length} ตัวที่มีค่านี้อยู่) และตั้งให้ไม่บันทึกค่านี้อีกเวลากด Update<br><small>กดย้อนกลับได้จากหน้าตั้งค่านี้</small>`,
    );
    if (!ok) return;
    const backup = [];
    for (const p of targets) {
        const entry = { id: p.id, values: {}, exclude: Array.isArray(p.exclude) ? [...p.exclude] : null };
        for (const f of fields) {
            if (p[f] !== undefined) entry.values[f] = p[f];
            delete p[f];
        }
        p.exclude = [...new Set([...(p.exclude ?? []), ...fields])];
        backup.push(entry);
    }
    settings().lastCleanup = { at: Date.now(), fields, entries: backup };
    save();
    renderSettingsState();
    toast.ok(`ลบ ${names} ออกจาก ${withValues.length} profile แล้ว`);
}

function undoCleanup() {
    const s = settings();
    const last = s.lastCleanup;
    if (!last) return;
    const profiles = ctx().extensionSettings.connectionManager?.profiles ?? [];
    let n = 0;
    for (const entry of last.entries) {
        const p = profiles.find(x => x.id === entry.id);
        if (!p) continue;
        Object.assign(p, entry.values);
        if (entry.exclude) p.exclude = entry.exclude; else delete p.exclude;
        n++;
    }
    s.lastCleanup = null;
    save();
    renderSettingsState();
    toast.ok(`คืนค่าให้ ${n} profile แล้ว`);
}

// ---------------------------------------------------------------- settings panel

function renderSettings() {
    const host = $id('extensions_settings2') ?? $id('extensions_settings');
    if (!host || $id('pf_settings')) return;
    const s = settings();
    host.insertAdjacentHTML('beforeend', `
    <div id="pf_settings" class="pf_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Preset Formatting <small class="pf_version">v${VERSION}</small></b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label"><input type="checkbox" id="pf_enabled"> ตั้งรูปแบบตาม preset อัตโนมัติ</label>
                <label class="checkbox_label"><input type="checkbox" id="pf_notify"> แจ้งเตือนเมื่อตั้งรูปแบบ</label>
                <label class="checkbox_label"><input type="checkbox" id="pf_topbar"> ช่องเลือก preset บนแถบ Chat Top Info Bar</label>
                <label class="checkbox_label" title="ข้อความ API – model ด้านขวาของแถบกินที่ ซ่อนเมื่อจอกว้างไม่ถึง 600px"><input type="checkbox" id="pf_hidestatus"> ซ่อนข้อความ API – model บนจอแคบ</label>
                <small id="pf_topbar_state" class="pf_note"></small>

                <div class="pf_set_title">ล็อก preset กับแชท</div>
                <label class="checkbox_label"><input type="checkbox" id="pf_chatlock"> เปิดแชทที่ล็อกไว้แล้วสลับไป preset นั้นให้</label>
                <div id="pf_lock_row" class="pf_set_row">
                    <span id="pf_lock_state"></span>
                    <div id="pf_lock_toggle" class="menu_button"></div>
                </div>
                <small class="pf_note">ล็อกแค่ preset ไม่แตะ connection · กดหมุด 📌 ข้างช่อง preset บน Top Info Bar หรือพิมพ์ <code>/preset-lock</code> ก็ได้ · branch ที่แตกจากแชทจะได้ล็อกเดิมติดไปด้วย</small>
                <small id="pf_lock_stcl" class="pf_note pf_warn" hidden>Character Locks (STCL) เปิด "Remember per chat" อยู่ มันจะสลับ preset ตามที่ตัวเองจำไว้ แย่งกับล็อกนี้และทำให้แชทรีโหลดซ้ำ ปิด Remember per chat ของ STCL (หรือปิด STCL) ถ้าจะใช้ล็อกของที่นี่</small>

                <div class="pf_set_title">Regex scripts</div>
                <label class="checkbox_label"><input type="checkbox" id="pf_scoped_on"> เปิด Scoped scripts (regex ในการ์ดตัวละคร) เสมอ</label>
                <label class="checkbox_label"><input type="checkbox" id="pf_presetrx_on"> เปิด Preset scripts (regex ในไฟล์ preset) เสมอ</label>
                <small class="pf_note">Regex Preset (และ connection profile ที่เก็บ Regex Preset ไว้) จะปิด script ทุกตัวที่ไม่ได้อยู่ในชุดตอนบันทึก ซึ่งรวมถึง regex ของการ์ดตัวอื่นและของ preset ตัวอื่นด้วย ติ๊กไว้แล้ว script ที่ถูกปิดจะเปิดกลับเองทันที · ข้อเสียคือถ้าไปปิดทีละตัวเอง พอเปลี่ยนแชทก็จะถูกเปิดคืน</small>

                <div class="pf_set_title">ผูก preset กับ connection</div>
                <div class="pf_set_row">
                    <span id="pf_bind_state"></span>
                    <div id="pf_bind_toggle" class="menu_button"></div>
                </div>

                <div class="pf_set_title">ล้างค่าที่ทับกันใน connection profile</div>
                <small class="pf_note">ถ้า profile บันทึกค่าเหล่านี้ไว้ ตอนสลับ profile มันจะทับค่าที่ preset ตั้งให้ เอาออกเพื่อให้ profile เหลือแค่ท่อ (API · endpoint · key · model · post-processing)</small>
                <div id="pf_clean_fields" class="pf_clean_fields"></div>
                <div class="pf_btns">
                    <div id="pf_clean_run" class="menu_button"><i class="fa-solid fa-broom"></i> เอาออกจากทุก profile</div>
                    <div id="pf_clean_undo" class="menu_button" hidden><i class="fa-solid fa-rotate-left"></i> ย้อนกลับครั้งล่าสุด</div>
                </div>
            </div>
        </div>
    </div>`);

    const bind = (id, key, after) => {
        const el = /** @type {HTMLInputElement} */ ($id(id));
        el.checked = !!s[key];
        el.addEventListener('change', () => { s[key] = el.checked; save(); after?.(); });
    };
    bind('pf_enabled', 'enabled');
    bind('pf_notify', 'notify');
    bind('pf_topbar', 'topBar', () => { syncTopBar(); renderSettingsState(); });
    bind('pf_hidestatus', 'hideStatusNarrow', applyBodyClasses);
    bind('pf_scoped_on', 'scopedAlwaysOn', enforceRegexOn);
    bind('pf_presetrx_on', 'presetScriptsAlwaysOn', enforceRegexOn);
    bind('pf_chatlock', 'chatLock', () => { syncLockUi(); applyChatLockSoon(); });
    $id('pf_lock_toggle').addEventListener('click', () => toggleChatLock());

    $id('pf_clean_fields').innerHTML = Object.entries(PROFILE_FIELDS).map(([f, { label, checked }]) =>
        `<label class="checkbox_label"><input type="checkbox" data-f="${f}" ${checked ? 'checked' : ''}> ${esc(label)} <small class="pf_count" data-f="${f}"></small></label>`).join('');
    $id('pf_clean_run').addEventListener('click', () => {
        const fields = [...$id('pf_clean_fields').querySelectorAll('input:checked')].map(i => i.dataset.f);
        if (!fields.length) { toast.info('เลือกอย่างน้อยหนึ่งค่า'); return; }
        cleanProfiles(fields);
    });
    $id('pf_clean_undo').addEventListener('click', undoCleanup);

    $id('pf_bind_toggle').addEventListener('click', () => {
        // Let SillyTavern's own toggle do the work, so its handler and state stay authoritative.
        const label = document.querySelector('label[for="bind_preset_to_connection"]');
        if (label) label.click(); else $('#bind_preset_to_connection').prop('checked', (_, v) => !v).trigger('input');
        setTimeout(renderSettingsState, 50);
    });
    $('#bind_preset_to_connection').on('input change', () => setTimeout(renderSettingsState, 0));

    // Counts change when profiles are created/updated elsewhere; refresh whenever the drawer is opened.
    $id('pf_settings').querySelector('.inline-drawer-toggle').addEventListener('click', () => setTimeout(renderSettingsState, 0));
    renderSettingsState();
}

function renderSettingsState() {
    if (!$id('pf_settings')) return;
    const bound = !!(/** @type {HTMLInputElement} */ ($id('bind_preset_to_connection'))?.checked);
    $id('pf_bind_state').innerHTML = bound
        ? '<i class="fa-solid fa-link pf_bad_text"></i> <b>ผูกอยู่</b> — เปลี่ยน preset แล้ว source / endpoint / model จะเปลี่ยนตาม'
        : '<i class="fa-solid fa-link-slash pf_good_text"></i> <b>ไม่ผูก</b> — เปลี่ยน preset แล้ว connection อยู่นิ่ง';
    $id('pf_bind_toggle').innerHTML = bound ? '<i class="fa-solid fa-link-slash"></i> เลิกผูก' : '<i class="fa-solid fa-link"></i> ผูกกลับ';

    const counts = profileFieldCounts();
    $id('pf_clean_fields').querySelectorAll('.pf_count').forEach(el => {
        const n = counts[el.dataset.f];
        el.textContent = n ? `(${n} profile)` : '(ไม่มี)';
    });
    syncLockUi();
    const last = settings().lastCleanup;
    const undo = $id('pf_clean_undo');
    undo.hidden = !last;
    if (last) undo.title = `ย้อนการล้าง ${last.fields.map(f => PROFILE_FIELDS[f]?.label ?? f).join(', ')} เมื่อ ${new Date(last.at).toLocaleString()}`;

    const tb = $id('pf_topbar_state');
    if (tb) {
        tb.textContent = !settings().topBar ? '' : !$id('extensionConnectionProfiles')
            ? 'ไม่พบ Chat Top Info Bar — ติดตั้ง https://github.com/SillyTavern/Extension-TopInfoBar แล้วกดไอคอนปลั๊กบนแถบเพื่อเปิดแถว connection'
            : 'ช่อง preset อยู่ในแถว connection ของ Top Info Bar (กดไอคอนปลั๊กบนแถบเพื่อเปิด/ปิดแถวนี้)';
    }
}

// ---------------------------------------------------------------- stale-code check
//
// SillyTavern loads extension files by a fixed URL, and a home-screen web app
// on iOS rarely does a real reload, so after "Update" the old code can keep
// running for a long time. Compare with the manifest on the server; if it is
// newer, refresh the cached files explicitly and reload.

let versionCheckedAt = 0;
let versionToastShown = false;

async function checkForNewVersion() {
    if (versionToastShown || Date.now() - versionCheckedAt < 10 * 60_000) return;
    versionCheckedAt = Date.now();
    let remote;
    try {
        const res = await fetch(new URL('manifest.json', BASE_URL), { cache: 'no-store' });
        if (!res.ok) return;
        remote = String((await res.json())?.version ?? '');
    } catch { return; }
    if (!remote || remote === VERSION) return;
    versionToastShown = true;
    globalThis.toastr?.info(`ติดตั้ง v${esc(remote)} ไว้แล้ว แต่หน้านี้ยังรัน v${VERSION} อยู่<br>แตะที่นี่เพื่อโหลดเวอร์ชันใหม่`, 'Preset Formatting', {
        timeOut: 0, extendedTimeOut: 0, closeButton: true, escapeHtml: false,
        onclick: () => reloadWithFreshFiles(),
    });
}

async function reloadWithFreshFiles() {
    try {
        // cache: 'reload' fetches from the server and overwrites the browser's cached copy,
        // so the page reload below picks up the new files.
        await Promise.all(['index.js', 'style.css', 'manifest.json'].map(f =>
            fetch(new URL(f, BASE_URL), { cache: 'reload' }).catch(() => null)));
    } finally {
        location.reload();
    }
}

// ---------------------------------------------------------------- init

function init() {
    if (globalThis.PresetFormatting) return; // loaded twice
    settings();
    applyBodyClasses();
    renderSettings();

    const { eventSource, event_types: E } = ctx();
    eventSource.on(E.PRESET_CHANGED, onPresetChanged);
    eventSource.on(E.PRESET_CHANGED, () => enforceRegexOnSoon());
    eventSource.on(E.CHAT_CHANGED, () => enforceRegexOnSoon());
    eventSource.on(E.CHAT_CHANGED, () => { syncLockUi(); applyChatLockSoon(); });
    if (E.MAIN_API_CHANGED) eventSource.on(E.MAIN_API_CHANGED, () => { syncTopBar(); renderEditor(); });
    registerCommands();
    let started = false;
    const start = () => {
        if (started) return;
        started = true;
        renderEditor();
        watchForTopBar();
        renderSettingsState();
        applyChatLockSoon(); // the chat open at start-up
        const main = presetSelect();
        if (main) {
            main.addEventListener('change', () => setTimeout(syncTopBar, 0));
            new MutationObserver(() => { syncTopBar(); renderEditor(); }).observe(main, { childList: true });
        }
    };
    eventSource.once(E.APP_READY, start);
    setTimeout(start, 8000); // in case APP_READY had already fired (extension enabled without a reload)
    if (E.PRESET_RENAMED) eventSource.on(E.PRESET_RENAMED, () => { syncTopBar(); renderEditor(); });
    if (E.PRESET_DELETED) eventSource.on(E.PRESET_DELETED, () => { syncTopBar(); renderEditor(); });

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForNewVersion(); });
    setTimeout(checkForNewVersion, 3000);
    globalThis.PresetFormatting = { VERSION, checkForNewVersion, reloadWithFreshFiles, readFormat, writeFormat, applyFormat, settings, syncTopBar, renderEditor, getChatLock: chatLock, setChatLock, applyChatLock };
    console.log(LOG, 'loaded', `v${VERSION}`);
}

if (typeof jQuery === 'function') jQuery(init); else init();
