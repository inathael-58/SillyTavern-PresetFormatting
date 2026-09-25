/*
 * Preset Formatting — SillyTavern UI extension
 *
 * Lets a Chat Completion preset carry its own response formatting:
 *   • Reasoning Template (+ Auto-Parse)
 *   • Start Reply With
 *   • Custom Stopping Strings
 * The values live inside the preset file (preset.extensions.presetFormatting),
 * so they follow the preset when it is selected, renamed, "saved as" or exported.
 *
 * With formatting moved into presets, connection profiles only need to hold the
 * connection itself (source, endpoint, key, model, post-processing). To make that
 * pairing quick, a preset dropdown is added next to the connection dropdown of
 * the Chat Top Info Bar extension.
 */

const MODULE = 'preset_formatting';
const FIELD = 'presetFormatting';
const LOG = '[PresetFormatting]';

const DEFAULTS = Object.freeze({
    enabled: true,
    topBar: true,
    hideStatusNarrow: true,
    notify: true,
    lastCleanup: null,
});

/** What a preset can carry, and the SillyTavern control each one drives. */
const FORMAT_FIELDS = Object.freeze({
    reasoningTemplate: { label: 'Reasoning Template', short: 'Reasoning' },
    autoParse: { label: 'Auto-Parse (reasoning)', short: 'Auto-Parse' },
    startReplyWith: { label: 'Start Reply With', short: 'Start Reply' },
    stopStrings: { label: 'Custom Stopping Strings', short: 'Stop' },
});

/** Connection profile fields that would override what the preset sets. */
const PROFILE_FIELDS = Object.freeze({
    'reasoning-template': { label: 'Reasoning Template', checked: true },
    'start-reply-with': { label: 'Start Reply With', checked: true },
    'stop-strings': { label: 'Custom Stopping Strings', checked: false },
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
};

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
    return done;
}

function summaryOf(fmt) {
    const parts = [];
    if (fmt.reasoningTemplate !== undefined) parts.push(fmt.reasoningTemplate);
    if (fmt.autoParse !== undefined) parts.push(`Auto-Parse ${fmt.autoParse ? 'เปิด' : 'ปิด'}`);
    if (fmt.startReplyWith !== undefined) parts.push(FORMAT_FIELDS.startReplyWith.short);
    if (fmt.stopStrings !== undefined) parts.push(FORMAT_FIELDS.stopStrings.short);
    return parts.join(' · ');
}

// ---------------------------------------------------------------- preset change

async function onPresetChanged(e) {
    if (e?.apiId && e.apiId !== 'openai') return;
    syncTopBar();
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

function renderEditor() {
    if (!buildEditor()) return;
    fillEditor(readFormat());
}

// ---------------------------------------------------------------- preset dropdown in the Chat Top Info Bar

let tbIcon = null;
let tbSelect = null;

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
    }
    if (!host.contains(tbSelect)) host.prepend(tbIcon, tbSelect);
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
                <b>Preset Formatting</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label"><input type="checkbox" id="pf_enabled"> ตั้งรูปแบบตาม preset อัตโนมัติ</label>
                <label class="checkbox_label"><input type="checkbox" id="pf_notify"> แจ้งเตือนเมื่อตั้งรูปแบบ</label>
                <label class="checkbox_label"><input type="checkbox" id="pf_topbar"> ช่องเลือก preset บนแถบ Chat Top Info Bar</label>
                <label class="checkbox_label" title="ข้อความ API – model ด้านขวาของแถบกินที่ ซ่อนเมื่อจอกว้างไม่ถึง 600px"><input type="checkbox" id="pf_hidestatus"> ซ่อนข้อความ API – model บนจอแคบ</label>
                <small id="pf_topbar_state" class="pf_note"></small>

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

// ---------------------------------------------------------------- init

function init() {
    if (globalThis.PresetFormatting) return; // loaded twice
    settings();
    applyBodyClasses();
    renderSettings();

    const { eventSource, event_types: E } = ctx();
    eventSource.on(E.PRESET_CHANGED, onPresetChanged);
    if (E.MAIN_API_CHANGED) eventSource.on(E.MAIN_API_CHANGED, () => { syncTopBar(); renderEditor(); });
    let started = false;
    const start = () => {
        if (started) return;
        started = true;
        renderEditor();
        watchForTopBar();
        renderSettingsState();
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

    globalThis.PresetFormatting = { readFormat, writeFormat, applyFormat, settings, syncTopBar, renderEditor };
    console.log(LOG, 'loaded');
}

if (typeof jQuery === 'function') jQuery(init); else init();
