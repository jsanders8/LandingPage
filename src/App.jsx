import { useState, useEffect, useRef } from "react";
import db from "./db.js";

const HIP_OPTIONS     = ["No issues", "Mild tightness", "Moderate tightness", "Pain — backed off", "Pain — stopped"];
const EFFORT_OPTIONS  = ["Very easy", "Easy", "Moderate", "Hard", "Too hard"];
const WORKOUT_OPTIONS = ["Easy run", "Long run", "Tempo run", "Shakeout", "Hip circuit", "Mobility only", "Rest day"];
const STRETCHING_OPTIONS = ["Yes — full routine", "Partial", "Skipped"];
const ZONE_OPTIONS    = ["Mostly recovery", "Mostly aerobic endurance", "Mixed zones", "Mostly threshold", "Mostly anaerobic"];

const RUN_TYPES   = new Set(["Easy run", "Long run", "Tempo run", "Shakeout"]);
const SOLO_TYPES  = new Set(["Rest day", "Mobility only"]);
const HIP_COLORS  = ["#3ecf8e", "#a8e063", "#f7c948", "#ff9b4e", "#ff5252"];
const EFFORT_COLORS = ["#3ecf8e", "#7ec8e3", "#f7c948", "#ff9b4e", "#ff5252"];

const hasRun     = (ws) => ws.some(w => RUN_TYPES.has(w));
const hasCircuit = (ws) => ws.includes("Hip circuit");

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDate(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
}

function Label({ children }) {
  return <div style={{ fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"#555", marginBottom:8 }}>{children}</div>;
}
function Section({ children }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{children}</div>;
}

const EMPTY = {
  date: todayStr(), workouts: [], miles: "", hipFeel: "", effort: "", stretching: "",
  avgPace: "", avgHR: "", maxHR: "", trainingEffect: "", cadence: "", zone: "",
  circuitNotes: "", notes: "",
};

async function dbGet() {
  return db.entries.orderBy("date").reverse().toArray();
}

async function dbSave(entry) {
  await db.entries.put(entry);
}

async function dbDelete(id) {
  await db.entries.delete(id);
}

export default function App() {
  const [view, setView]       = useState("checkin");
  const [log, setLog]         = useState([]);
  const [saved, setSaved]     = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [form, setForm]       = useState({ ...EMPTY, date: todayStr() });
  const fileRef = useRef();

  useEffect(() => {
    dbGet().then(setLog).catch(() => setLog([]));
  }, []);

  async function refreshLog() {
    const entries = await dbGet();
    setLog(entries);
  }

  async function exportLog() {
    const allEntries = await dbGet();
    if (!allEntries.length) return;
    const json = JSON.stringify(allEntries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `training-log-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error("not an array");
        // bulkPut = upsert: existing entries with same id are replaced,
        // new entries are added. Safe to run against a non-empty DB.
        await db.entries.bulkPut(imported);
        await refreshLog();
        setImportMsg(`Imported ${imported.length} entries`);
        setTimeout(() => setImportMsg(""), 3500);
      } catch {
        setImportMsg("Invalid file — must be a JSON backup from this app");
        setTimeout(() => setImportMsg(""), 3500);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function toggleWorkout(w) {
    setForm(f => {
      let next;
      if (SOLO_TYPES.has(w)) {
        next = f.workouts.includes(w) ? [] : [w];
      } else {
        const without = f.workouts.filter(x => !SOLO_TYPES.has(x));
        next = without.includes(w) ? without.filter(x => x !== w) : [...without, w];
      }
      const runNow  = next.some(x => RUN_TYPES.has(x));
      const circNow = next.includes("Hip circuit");
      return {
        ...f,
        workouts: next,
        ...(runNow  ? {} : { avgPace:"", avgHR:"", maxHR:"", trainingEffect:"", cadence:"", zone:"", miles:"" }),
        ...(circNow ? {} : { circuitNotes:"" }),
      };
    });
  }

  async function handleSubmit() {
    if (!form.workouts.length || !form.hipFeel || !form.effort || !form.stretching) return;
    const existing = log.find(e => e.date === form.date);
    const entry    = { ...form, id: existing ? existing.id : Date.now() };
    try {
      await dbSave(entry);
      setSaveErr(false);
      await refreshLog();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setForm({ ...EMPTY, date: todayStr() });
    } catch {
      setSaveErr(true);
    }
  }

  async function deleteEntry(id) {
    try {
      await dbDelete(id);
      setLog(prev => prev.filter(e => e.id !== id));
    } catch {
      setSaveErr(true);
    }
  }

  const setField = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const hipIdx   = (v) => HIP_OPTIONS.indexOf(v);
  const effIdx   = (v) => EFFORT_OPTIONS.indexOf(v);

  const last14      = [...log].sort((a,b) => a.date.localeCompare(b.date)).slice(-14);
  const avgHipScore = last14.length ? (last14.reduce((s,e) => s + Math.max(0, hipIdx(e.hipFeel)), 0) / last14.length).toFixed(1) : null;
  const avgEffScore = last14.length ? (last14.reduce((s,e) => s + Math.max(0, effIdx(e.effort)), 0) / last14.length).toFixed(1) : null;
  const stretchRate = last14.length ? Math.round(last14.filter(e => e.stretching === "Yes — full routine").length / last14.length * 100) : null;
  const totalMiles  = log.reduce((s,e) => s + (parseFloat(e.miles) || 0), 0).toFixed(1);
  const runDays     = [...log].filter(e => hasRun(e.workouts || []) && e.avgHR).sort((a,b) => a.date.localeCompare(b.date)).slice(-14);
  const hrVals      = runDays.map(e => parseInt(e.avgHR)).filter(Boolean);
  const hrMin       = hrVals.length ? Math.min(...hrVals) - 5 : 100;
  const hrMax       = hrVals.length ? Math.max(...hrVals) + 5 : 180;

  const chipCls = (sel, idx) => {
    if (!sel) return "chip";
    if (idx <= 1) return "chip sg";
    if (idx === 2) return "chip sy";
    if (idx === 3) return "chip so";
    return "chip sr";
  };

  const runSel    = hasRun(form.workouts);
  const circSel   = hasCircuit(form.workouts);
  const canSubmit = form.workouts.length > 0 && form.hipFeel && form.effort && form.stretching;

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0a", color:"#f0f0f0", fontFamily:"'DM Sans',sans-serif", fontWeight:300 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .tab { background: none; border: none; color: #555; font-family: 'DM Sans', sans-serif; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; padding: 10px 16px; border-bottom: 2px solid transparent; transition: all .15s; }
        .tab.active { color: #e8ff47; border-bottom-color: #e8ff47; }
        .tab:hover:not(.active) { color: #aaa; }
        .chip { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px; padding: 9px 14px; font-size: 12px; cursor: pointer; transition: all .12s; color: #777; text-align: center; user-select: none; position: relative; }
        .chip:hover { border-color: #444; color: #ddd; }
        .sg { background: #0e1e12; border-color: #3ecf8e; color: #3ecf8e; }
        .sy { background: #1a1a08; border-color: #e8ff47; color: #e8ff47; }
        .so { background: #1e1008; border-color: #ff9b4e; color: #ff9b4e; }
        .sr { background: #1e0808; border-color: #ff5252; color: #ff5252; }
        .sb { background: #08081e; border-color: #7c9ef8; color: #7c9ef8; }
        .input { background: #141414; border: 1px solid #252525; border-radius: 4px; padding: 10px 14px; font-size: 13px; color: #f0f0f0; font-family: 'DM Sans', sans-serif; width: 100%; outline: none; transition: border-color .15s; }
        .input:focus { border-color: #444; }
        .sub { background: #0e0e0e; border: 1px solid #1e1e1e; border-radius: 6px; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
        .sublbl { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; font-weight: 500; margin-bottom: 10px; }
        .cgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .flbl { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #444; margin-bottom: 5px; }
        .sbtn { background: #e8ff47; color: #0a0a0a; border: none; border-radius: 4px; padding: 14px; font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: .08em; cursor: pointer; width: 100%; transition: opacity .15s; }
        .sbtn:hover { opacity: .88; }
        .sbtn:disabled { opacity: .25; cursor: not-allowed; }
        .gbtn { background: none; border: 1px solid #252525; border-radius: 4px; padding: 8px 14px; font-family: 'DM Sans', sans-serif; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #555; cursor: pointer; transition: all .12s; }
        .gbtn:hover { border-color: #444; color: #aaa; }
        .gbtn:disabled { opacity: .3; cursor: not-allowed; }
        .logcard { background: #141414; border: 1px solid #1e1e1e; border-radius: 6px; padding: 14px 16px; margin-bottom: 8px; transition: border-color .12s; }
        .logcard:hover { border-color: #2a2a2a; }
        .dbtn { background: none; border: none; color: #2a2a2a; cursor: pointer; font-size: 14px; padding: 2px 6px; transition: color .12s; }
        .dbtn:hover { color: #ff5252; }
        .tag { display: inline-block; font-size: 11px; background: #0e0e0e; border: 1px solid #222; border-radius: 3px; padding: 3px 8px; color: #666; }
        .sc { background: #141414; border: 1px solid #1e1e1e; border-radius: 6px; padding: 16px 18px; }
        .bwrap { background: #1a1a1a; border-radius: 2px; height: 5px; width: 100%; margin-top: 8px; overflow: hidden; }
        .bfill { height: 100%; border-radius: 2px; transition: width .4s; }
        .backup-note { background: rgba(232,255,71,0.03); border: 1px solid rgba(232,255,71,0.1); border-radius: 5px; padding: 10px 14px; font-size: 11px; color: #555; line-height: 1.6; }
        .backup-note strong { color: #e8ff47; font-weight: 500; }
      `}</style>

      <div style={{ padding:"28px 24px 0", borderBottom:"1px solid #161616" }}>
        <div style={{ fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", color:"#e8ff47", marginBottom:4 }}>Half Marathon Build</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, letterSpacing:"0.04em", lineHeight:1 }}>DAILY CHECK-IN</div>
        <div style={{ fontSize:12, color:"#383838", marginTop:4, marginBottom:16 }}>Log your workout · track your hip · spot the trends</div>
        <div style={{ display:"flex", marginBottom:-1, alignItems:"center" }}>
          {["checkin","log","trends"].map(t => (
            <button key={t} className={"tab" + (view===t?" active":"")} onClick={() => setView(t)}>
              {t==="checkin" ? "Today" : t==="log" ? ("Log ("+log.length+")") : "Trends"}
            </button>
          ))}
          <a
            href="/training-plan.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft:"auto", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"#2a2a2a", textDecoration:"none", padding:"10px 16px", borderBottom:"2px solid transparent", transition:"color .15s" }}
            onMouseEnter={e => e.target.style.color="#888"}
            onMouseLeave={e => e.target.style.color="#2a2a2a"}
          >
            Plan ↗
          </a>
        </div>
      </div>

      <div style={{ padding:"24px", maxWidth:600, margin:"0 auto" }}>

        {view === "checkin" && (
          <div style={{ display:"flex", flexDirection:"column", gap:22 }}>

            <Section>
              <Label>Date</Label>
              <input type="date" className="input" value={form.date} onChange={e => setForm(f => ({...f, date:e.target.value}))} style={{ maxWidth:180 }} />
            </Section>

            <Section>
              <Label>What did you do today? <span style={{ color:"#333", textTransform:"none", letterSpacing:0 }}>(select all that apply)</span></Label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                {WORKOUT_OPTIONS.map(w => {
                  const sel = form.workouts.includes(w);
                  return (
                    <div key={w} className={"chip" + (sel?" sy":"")} onClick={() => toggleWorkout(w)}>
                      {sel && <span style={{ position:"absolute", top:4, right:6, fontSize:9, opacity:0.6 }}>✓</span>}
                      {w}
                    </div>
                  );
                })}
              </div>
              {form.workouts.length > 0 && (
                <div style={{ fontSize:11, color:"#444", marginTop:2 }}>Selected: {form.workouts.join(" + ")}</div>
              )}
            </Section>

            {runSel && (
              <Section>
                <Label>Miles Completed</Label>
                <input type="number" step="0.1" min="0" className="input" placeholder="e.g. 3.0" value={form.miles} onChange={e => setForm(f => ({...f, miles:e.target.value}))} style={{ maxWidth:140 }} />
              </Section>
            )}

            <Section>
              <Label>How did the hip feel?</Label>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {HIP_OPTIONS.map((h,i) => (
                  <div key={h} className={chipCls(form.hipFeel===h, i)} onClick={() => setField("hipFeel")(h)} style={{ textAlign:"left" }}>{h}</div>
                ))}
              </div>
            </Section>

            <Section>
              <Label>Perceived Effort</Label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                {EFFORT_OPTIONS.map((e,i) => (
                  <div key={e} className={chipCls(form.effort===e, i)} onClick={() => setField("effort")(e)}>{e}</div>
                ))}
              </div>
            </Section>

            <Section>
              <Label>Stretching done today?</Label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                {STRETCHING_OPTIONS.map((s,i) => (
                  <div key={s} className={chipCls(form.stretching===s, i===0?0:i===1?2:4)} onClick={() => setField("stretching")(s)}>{s}</div>
                ))}
              </div>
            </Section>

            {runSel && (
              <Section>
                <Label>Coros Run Data <span style={{ color:"#2a2a2a", textTransform:"none", letterSpacing:0 }}>(optional)</span></Label>
                <div className="sub">
                  <div style={{ color:"#3ecf8e" }} className="sublbl">From your Coros summary</div>
                  <div className="cgrid">
                    <div>
                      <div className="flbl">Avg Pace</div>
                      <input className="input" placeholder="e.g. 9:18" value={form.avgPace} onChange={e => setForm(f => ({...f, avgPace:e.target.value}))} />
                    </div>
                    <div>
                      <div className="flbl">Avg HR (bpm)</div>
                      <input className="input" type="number" placeholder="145" value={form.avgHR} onChange={e => setForm(f => ({...f, avgHR:e.target.value}))} />
                    </div>
                    <div>
                      <div className="flbl">Max HR (bpm)</div>
                      <input className="input" type="number" placeholder="151" value={form.maxHR} onChange={e => setForm(f => ({...f, maxHR:e.target.value}))} />
                    </div>
                    <div>
                      <div className="flbl">Cadence (avg)</div>
                      <input className="input" type="number" placeholder="153" value={form.cadence} onChange={e => setForm(f => ({...f, cadence:e.target.value}))} />
                    </div>
                    <div style={{ gridColumn:"1/-1" }}>
                      <div className="flbl">Training Effect (Aerobic / Anaerobic)</div>
                      <input className="input" placeholder="e.g. 1.5 / 0.8" value={form.trainingEffect} onChange={e => setForm(f => ({...f, trainingEffect:e.target.value}))} />
                    </div>
                  </div>
                  <div>
                    <div className="flbl" style={{ marginBottom:8 }}>Dominant HR Zone</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {ZONE_OPTIONS.map(z => (
                        <div key={z} className={"chip" + (form.zone===z?" sb":"")} onClick={() => setField("zone")(z)} style={{ textAlign:"left" }}>{z}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {circSel && (
              <Section>
                <Label>Hip Circuit Notes <span style={{ color:"#2a2a2a", textTransform:"none", letterSpacing:0 }}>(optional)</span></Label>
                <div className="sub">
                  <div style={{ color:"#7c9ef8" }} className="sublbl">Circuit check</div>
                  <textarea className="input" style={{ resize:"vertical", minHeight:60 }} placeholder="Any exercises that aggravated the hip? Stability progress?" value={form.circuitNotes} onChange={e => setForm(f => ({...f, circuitNotes:e.target.value}))} />
                </div>
              </Section>
            )}

            <Section>
              <Label>General Notes <span style={{ color:"#2a2a2a", textTransform:"none", letterSpacing:0 }}>(optional)</span></Label>
              <textarea className="input" style={{ resize:"vertical", minHeight:60 }} placeholder="Fatigue, sleep, weather, how legs felt..." value={form.notes} onChange={e => setForm(f => ({...f, notes:e.target.value}))} />
            </Section>

            <button className="sbtn" disabled={!canSubmit} onClick={handleSubmit}>
              {saved ? "SAVED ✓" : "LOG TODAY"}
            </button>

            {saveErr && (
              <div style={{ fontSize:11, color:"#ff9b4e", textAlign:"center" }}>
                Save failed — try refreshing the page.
              </div>
            )}
          </div>
        )}

        {view === "log" && (
          <div>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
              <button className="gbtn" disabled={log.length===0} onClick={exportLog}>Export backup</button>
              <button className="gbtn" onClick={() => fileRef.current?.click()}>Import backup</button>
              <input ref={fileRef} type="file" accept=".json" style={{ display:"none" }} onChange={handleImport} />
              <span style={{ marginLeft:"auto", fontSize:11, color:"#333" }}>{log.length} entries</span>
            </div>

            {importMsg && (
              <div style={{ marginBottom:12, fontSize:12, color: importMsg.startsWith("Imported") ? "#3ecf8e" : "#ff5252" }}>
                {importMsg}
              </div>
            )}

            <div className="backup-note" style={{ marginBottom:16 }}>
              <strong>Backup tip:</strong> Your data lives in this browser's storage. Export a backup before clearing browser data or switching devices. Import restores everything — existing entries are kept, imported ones are merged in.
            </div>

            {log.length === 0 && (
              <div style={{ color:"#333", fontSize:13, textAlign:"center", marginTop:48 }}>No entries yet. Log your first workout.</div>
            )}

            {[...log].sort((a,b) => b.date.localeCompare(a.date)).map(entry => {
              const hi = Math.max(0, hipIdx(entry.hipFeel));
              const hipColor = HIP_COLORS[hi] || "#555";
              const ws = entry.workouts || (entry.workout ? [entry.workout] : []);
              const hasCoros = entry.avgPace || entry.avgHR || entry.cadence || entry.trainingEffect;
              return (
                <div key={entry.id} className="logcard">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:"#e8ff47" }}>{formatDate(entry.date)}</div>
                      <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{ws.join(" + ")}{entry.miles ? " · " + entry.miles + " mi" : ""}</div>
                    </div>
                    <button className="dbtn" onClick={() => deleteEntry(entry.id)}>✕</button>
                  </div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                    <span className="tag" style={{ borderColor:hipColor, color:hipColor }}>Hip: {entry.hipFeel}</span>
                    <span className="tag">Effort: {entry.effort}</span>
                    <span className="tag" style={{ color:entry.stretching==="Yes — full routine"?"#3ecf8e":"#444" }}>Stretch: {entry.stretching}</span>
                  </div>
                  {hasCoros && (
                    <div style={{ background:"#080808", border:"1px solid #0e1e12", borderRadius:4, padding:"8px 12px", marginBottom:8 }}>
                      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", color:"#3ecf8e", marginBottom:6 }}>Coros</div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {entry.avgPace && <span className="tag">Pace: {entry.avgPace}/mi</span>}
                        {entry.avgHR   && <span className="tag">Avg HR: {entry.avgHR}</span>}
                        {entry.maxHR   && <span className="tag">Max HR: {entry.maxHR}</span>}
                        {entry.cadence && <span className="tag">Cadence: {entry.cadence}</span>}
                        {entry.trainingEffect && <span className="tag">TE: {entry.trainingEffect}</span>}
                        {entry.zone    && <span className="tag" style={{ color:"#7c9ef8", borderColor:"#1a1a2a" }}>{entry.zone}</span>}
                      </div>
                    </div>
                  )}
                  {entry.circuitNotes && (
                    <div style={{ background:"#080808", border:"1px solid #0e0e1e", borderRadius:4, padding:"8px 12px", marginBottom:8 }}>
                      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", color:"#7c9ef8", marginBottom:4 }}>Circuit</div>
                      <div style={{ fontSize:12, color:"#555" }}>{entry.circuitNotes}</div>
                    </div>
                  )}
                  {entry.notes && <div style={{ fontSize:12, color:"#444", fontStyle:"italic" }}>{entry.notes}</div>}
                </div>
              );
            })}
          </div>
        )}

        {view === "trends" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {log.length === 0 && (
              <div style={{ color:"#333", fontSize:13, textAlign:"center", marginTop:48 }}>Log some workouts first to see trends.</div>
            )}
            {log.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div className="sc">
                    <div style={{ fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"#444" }}>Total Miles</div>
                    <div style={{ fontFamily:"'Bebas Neue'", fontSize:38, color:"#e8ff47", lineHeight:1.1 }}>{totalMiles}</div>
                    <div style={{ fontSize:11, color:"#333" }}>all time</div>
                  </div>
                  <div className="sc">
                    <div style={{ fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"#444" }}>Workouts</div>
                    <div style={{ fontFamily:"'Bebas Neue'", fontSize:38, color:"#7c9ef8", lineHeight:1.1 }}>{log.length}</div>
                    <div style={{ fontSize:11, color:"#333" }}>logged</div>
                  </div>
                </div>

                {last14.length >= 2 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    <div className="sc">
                      <div style={{ fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"#444", marginBottom:10 }}>Hip Feel — Last 14 Days</div>
                      <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:44 }}>
                        {last14.map((e,i) => {
                          const hi = Math.max(0, hipIdx(e.hipFeel));
                          return <div key={i} title={formatDate(e.date) + ": " + e.hipFeel} style={{ flex:1, background:HIP_COLORS[hi], borderRadius:"2px 2px 0 0", height:Math.max(8,((hi+1)/5)*100)+"%", opacity:0.85 }} />;
                        })}
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                        <span style={{ fontSize:10, color:"#2a2a2a" }}>14 days ago</span>
                        <span style={{ fontSize:10, color:"#2a2a2a" }}>today</span>
                      </div>
                      {avgHipScore !== null && (
                        <div style={{ marginTop:8, fontSize:12, color:"#777" }}>
                          Avg: <span style={{ color:HIP_COLORS[Math.round(parseFloat(avgHipScore))] }}>{HIP_OPTIONS[Math.round(parseFloat(avgHipScore))]}</span>
                        </div>
                      )}
                    </div>

                    {runDays.length >= 2 && (
                      <div className="sc">
                        <div style={{ fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"#444", marginBottom:10 }}>Avg HR — Run Days</div>
                        <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:44 }}>
                          {runDays.map((e,i) => {
                            const hr  = parseInt(e.avgHR);
                            const pct = hrMax===hrMin ? 50 : ((hr-hrMin)/(hrMax-hrMin))*80+20;
                            const color = hr < 140 ? "#3ecf8e" : hr < 155 ? "#f7c948" : "#ff5252";
                            return <div key={i} title={formatDate(e.date) + ": " + hr + " bpm"} style={{ flex:1, background:color, borderRadius:"2px 2px 0 0", height:Math.max(10,pct)+"%", opacity:0.85 }} />;
                          })}
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                          <span style={{ fontSize:10, color:"#2a2a2a" }}>oldest</span>
                          <span style={{ fontSize:10, color:"#2a2a2a" }}>most recent</span>
                        </div>
                        <div style={{ marginTop:8, fontSize:12, color:"#777" }}>Zone 2 target: <span style={{ color:"#3ecf8e" }}>135–152 bpm</span></div>
                      </div>
                    )}

                    <div className="sc">
                      <div style={{ fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"#444", marginBottom:6 }}>Stretching Consistency</div>
                      <div style={{ fontFamily:"'Bebas Neue'", fontSize:32, color:stretchRate>=80?"#3ecf8e":stretchRate>=50?"#f7c948":"#ff5252", lineHeight:1 }}>{stretchRate}%</div>
                      <div className="bwrap"><div className="bfill" style={{ width:stretchRate+"%", background:stretchRate>=80?"#3ecf8e":stretchRate>=50?"#f7c948":"#ff5252" }} /></div>
                      <div style={{ fontSize:11, color:"#333", marginTop:6 }}>full routine completions (last 14 days)</div>
                    </div>

                    <div className="sc">
                      <div style={{ fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"#444", marginBottom:10 }}>Perceived Effort — Last 14 Days</div>
                      <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:44 }}>
                        {last14.map((e,i) => {
                          const ei = Math.max(0, effIdx(e.effort));
                          return <div key={i} title={formatDate(e.date) + ": " + e.effort} style={{ flex:1, background:EFFORT_COLORS[ei], borderRadius:"2px 2px 0 0", height:Math.max(8,((ei+1)/5)*100)+"%", opacity:0.8 }} />;
                        })}
                      </div>
                      {avgEffScore !== null && (
                        <div style={{ marginTop:8, fontSize:12, color:"#777" }}>
                          Avg: <span style={{ color:EFFORT_COLORS[Math.round(parseFloat(avgEffScore))] }}>{EFFORT_OPTIONS[Math.round(parseFloat(avgEffScore))]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ fontSize:11, color:"#2a2a2a", textAlign:"center", marginTop:4 }}>
                  Share your log with Claude anytime for trend analysis and plan adjustments.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
