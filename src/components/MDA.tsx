import React, { useMemo, useState } from 'react';
import './Analytics.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ─────────────────────────────────────────────
   Department reference data. Each department
   carries its own unit of measure plus 12 months
   of placeholder volumes, productive hours, paid
   hours, and supply cost. Wire these to real data
   once the GL / payroll / supply feed is online.
   ───────────────────────────────────────────── */
interface Dept {
  code: string;
  name: string;
  uom: string;
  volumes: number[];
  productiveHours: number[];
  paidHours: number[];
  supplyCost: number[];
}

const DEPTS: Dept[] = [
  {
    code: '7010',
    name: 'Operating Room',
    uom: 'Surgeries',
    volumes:         [112, 118, 121, 115, 124, 130, 128, 122, 119, 126, 131, 124],
    productiveHours: [870, 905, 940, 905, 970, 1020, 1010, 965, 945, 980, 1010, 970],
    paidHours:       [980, 1015, 1055, 1018, 1090, 1140, 1130, 1085, 1062, 1100, 1135, 1090],
    supplyCost:      [136000, 141600, 148040, 140050, 152480, 162500, 159744, 152528, 148631, 156870, 162888, 154256],
  },
  {
    code: '7030',
    name: 'Emergency Room',
    uom: 'ER Visits',
    volumes:         [1720, 1685, 1810, 1755, 1880, 1942, 1955, 1888, 1832, 1815, 1798, 1862],
    productiveHours: [3650, 3580, 3850, 3725, 3992, 4125, 4150, 4012, 3892, 3858, 3820, 3955],
    paidHours:       [4100, 4025, 4326, 4185, 4485, 4630, 4660, 4505, 4370, 4330, 4290, 4440],
    supplyCost:      [125560, 122905, 132130, 128115, 137240, 141766, 142715, 137824, 133736, 132495, 131254, 135926],
  },
  {
    code: '7050',
    name: 'Observation',
    uom: 'Observation Patients',
    volumes:         [142, 156, 138, 148, 152, 161, 167, 159, 154, 149, 158, 163],
    productiveHours: [1700, 1865, 1650, 1770, 1820, 1925, 2005, 1905, 1842, 1788, 1892, 1955],
    paidHours:       [1910, 2095, 1854, 1990, 2046, 2163, 2253, 2141, 2070, 2010, 2126, 2197],
    supplyCost:      [35500, 39000, 34500, 37000, 38000, 40250, 41750, 39750, 38500, 37250, 39500, 40750],
  },
  {
    code: '6010',
    name: 'Med / Surg',
    uom: 'Patient Days',
    volumes:         [882, 904, 871, 895, 920, 942, 958, 935, 912, 905, 921, 938],
    productiveHours: [5290, 5425, 5226, 5370, 5520, 5650, 5750, 5610, 5470, 5430, 5525, 5630],
    paidHours:       [5945, 6098, 5876, 6037, 6202, 6350, 6463, 6307, 6151, 6105, 6212, 6328],
    supplyCost:      [123480, 126560, 121940, 125300, 128800, 131880, 134120, 130900, 127680, 126700, 128940, 131320],
  },
  {
    code: '6020',
    name: 'ICU',
    uom: 'ICU Days',
    volumes:         [178, 182, 169, 184, 192, 198, 205, 199, 191, 188, 192, 196],
    productiveHours: [2130, 2185, 2030, 2210, 2305, 2375, 2460, 2390, 2295, 2255, 2305, 2350],
    paidHours:       [2395, 2456, 2280, 2483, 2592, 2670, 2766, 2685, 2581, 2536, 2592, 2643],
    supplyCost:      [89000, 91000, 84500, 92000, 96000, 99000, 102500, 99500, 95500, 94000, 96000, 98000],
  },
  {
    code: '6040',
    name: 'Labor & Delivery',
    uom: 'Deliveries',
    volumes:         [72, 78, 81, 76, 82, 85, 79, 83, 80, 77, 84, 86],
    productiveHours: [720, 785, 815, 760, 825, 855, 795, 835, 800, 770, 845, 865],
    paidHours:       [810, 882, 916, 854, 928, 961, 894, 939, 900, 866, 950, 972],
    supplyCost:      [54000, 58500, 60750, 57000, 61500, 63750, 59250, 62250, 60000, 57750, 63000, 64500],
  },
  {
    code: '8010',
    name: 'Imaging',
    uom: 'Procedures',
    volumes:         [2360, 2412, 2298, 2455, 2520, 2588, 2615, 2552, 2488, 2462, 2515, 2570],
    productiveHours: [1180, 1206, 1149, 1228, 1260, 1294, 1308, 1276, 1244, 1231, 1258, 1285],
    paidHours:       [1325, 1356, 1291, 1379, 1417, 1455, 1471, 1435, 1399, 1384, 1414, 1444],
    supplyCost:      [58880, 60168, 57344, 61252, 62880, 64544, 65216, 63696, 62080, 61432, 62752, 64104],
  },
  {
    code: '8020',
    name: 'Laboratory',
    uom: 'Tests',
    volumes:         [11800, 12015, 11680, 12320, 12648, 13002, 13145, 12822, 12498, 12366, 12628, 12895],
    productiveHours: [1180, 1202, 1168, 1232, 1265, 1300, 1314, 1282, 1250, 1237, 1263, 1290],
    paidHours:       [1326, 1351, 1313, 1385, 1422, 1462, 1478, 1442, 1406, 1391, 1421, 1450],
    supplyCost:      [82600, 84105, 81760, 86240, 88536, 91014, 92015, 89754, 87486, 86562, 88396, 90265],
  },
  {
    code: '8030',
    name: 'Pharmacy',
    uom: 'Doses Dispensed',
    volumes:         [17600, 17910, 17320, 18250, 18712, 19204, 19385, 18992, 18555, 18290, 18642, 18960],
    productiveHours: [880, 896, 866, 913, 936, 960, 969, 950, 928, 915, 932, 948],
    paidHours:       [990, 1008, 974, 1027, 1053, 1080, 1090, 1068, 1043, 1029, 1048, 1066],
    supplyCost:      [264000, 268650, 259800, 273750, 280680, 288060, 290775, 284880, 278325, 274350, 279630, 284400],
  },
  {
    code: '9020',
    name: 'PT / OT',
    uom: 'Therapy Units',
    volumes:         [3150, 3245, 3098, 3322, 3415, 3502, 3548, 3458, 3372, 3340, 3398, 3452],
    productiveHours: [1575, 1623, 1549, 1661, 1708, 1751, 1774, 1729, 1686, 1670, 1699, 1726],
    paidHours:       [1769, 1822, 1740, 1866, 1918, 1968, 1993, 1942, 1894, 1875, 1909, 1939],
    supplyCost:      [22050, 22715, 21686, 23254, 23905, 24514, 24836, 24206, 23604, 23380, 23786, 24164],
  },
];

type Tab = 'fte' | 'supplies';
type HoursType = 'productive' | 'paid';

const fmt1 = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const Sparkline: React.FC<{ values: number[]; color?: string }> = ({ values, color = '#1abc9c' }) => {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 110;
  const h = 24;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts} />
    </svg>
  );
};

const MDA: React.FC = () => {
  const [tab, setTab] = useState<Tab>('fte');
  const [hoursType, setHoursType] = useState<HoursType>('productive');

  return (
    <div className="analytics-page">
      <div className="analytics-head">
        <div>
          <h1>Analytics</h1>
          <div className="analytics-sub">
            Volume-driven labor and supply analysis. Each department is tracked against its own
            unit of measure — surgeries, ER visits, patient days, and so on — so trends are
            comparable on a per-unit basis.
          </div>
        </div>
      </div>

      <div className="analytics-tabs">
        <button
          type="button"
          className={`analytics-tab ${tab === 'fte' ? 'active' : ''}`}
          onClick={() => setTab('fte')}
        >
          <span className="material-icons">badge</span>
          FTEs
        </button>
        <button
          type="button"
          className={`analytics-tab ${tab === 'supplies' ? 'active' : ''}`}
          onClick={() => setTab('supplies')}
        >
          <span className="material-icons">inventory_2</span>
          Supplies
        </button>
      </div>

      {tab === 'fte' && <FteTab hoursType={hoursType} setHoursType={setHoursType} />}
      {tab === 'supplies' && <SuppliesTab />}
    </div>
  );
};

/* ─────────────────────────────────────────────
   FTE tab — hours per unit of volume per dept
   ───────────────────────────────────────────── */
const FteTab: React.FC<{
  hoursType: HoursType;
  setHoursType: (t: HoursType) => void;
}> = ({ hoursType, setHoursType }) => {
  const rows = useMemo(
    () =>
      DEPTS.map((d) => {
        const hours = hoursType === 'productive' ? d.productiveHours : d.paidHours;
        const ratios = hours.map((h, i) => (d.volumes[i] ? h / d.volumes[i] : 0));
        const totalHours = hours.reduce((a, b) => a + b, 0);
        const totalVolume = d.volumes.reduce((a, b) => a + b, 0);
        const ytdRatio = totalVolume ? totalHours / totalVolume : 0;
        const latestRatio = ratios[ratios.length - 1];
        const priorRatio = ratios[ratios.length - 2];
        const change = priorRatio ? ((latestRatio - priorRatio) / priorRatio) * 100 : 0;
        return { dept: d, ratios, ytdRatio, change };
      }),
    [hoursType],
  );

  return (
    <>
      <div className="analytics-toolbar">
        <div className="seg-toggle">
          <button
            type="button"
            className={hoursType === 'productive' ? 'on' : ''}
            onClick={() => setHoursType('productive')}
          >
            Productive Hours
          </button>
          <button
            type="button"
            className={hoursType === 'paid' ? 'on' : ''}
            onClick={() => setHoursType('paid')}
          >
            Paid Hours
          </button>
        </div>
        <span className="analytics-hint">
          Showing <strong>{hoursType === 'productive' ? 'productive' : 'paid'}</strong> hours per
          unit. Lower is better.
        </span>
      </div>

      <div className="analytics-card">
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Unit of Volume</th>
                {MONTHS.map((m, i) => (
                  <th key={m} className={`r ${i === 11 ? 'latest' : ''}`}>
                    {m}
                  </th>
                ))}
                <th className="r">Trend</th>
                <th className="r">YTD</th>
                <th className="r">Δ MoM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ dept, ratios, ytdRatio, change }) => (
                <tr key={dept.code}>
                  <td>
                    <div className="dept-name">{dept.name}</div>
                    <div className="dept-code mono">{dept.code}</div>
                  </td>
                  <td className="muted">{dept.uom}</td>
                  {ratios.map((r, i) => (
                    <td key={i} className={`r mono ${i === 11 ? 'latest' : ''}`}>
                      {fmt2(r)}
                    </td>
                  ))}
                  <td className="r">
                    <Sparkline values={ratios} color="#1abc9c" />
                  </td>
                  <td className="r mono strong">{fmt2(ytdRatio)}</td>
                  <td className={`r mono ${change >= 0 ? 'neg' : 'pos'}`}>
                    {change >= 0 ? '+' : ''}
                    {fmt1(change)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analytics-foot-note">
        <span className="material-icons" style={{ fontSize: 16, color: '#1abc9c' }}>
          info
        </span>
        Values are <strong>hours per {hoursType === 'productive' ? 'unit (productive)' : 'unit (paid)'}</strong>.
        Δ MoM compares the most recent month to the prior month — positive means more hours per
        unit (less efficient), negative means improved efficiency.
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────
   Supplies tab — supply cost per unit of volume
   ───────────────────────────────────────────── */
const SuppliesTab: React.FC = () => {
  const rows = useMemo(
    () =>
      DEPTS.map((d) => {
        const ratios = d.supplyCost.map((c, i) => (d.volumes[i] ? c / d.volumes[i] : 0));
        const totalCost = d.supplyCost.reduce((a, b) => a + b, 0);
        const totalVolume = d.volumes.reduce((a, b) => a + b, 0);
        const ytdRatio = totalVolume ? totalCost / totalVolume : 0;
        const latestRatio = ratios[ratios.length - 1];
        const priorRatio = ratios[ratios.length - 2];
        const change = priorRatio ? ((latestRatio - priorRatio) / priorRatio) * 100 : 0;
        return { dept: d, ratios, ytdRatio, ytdCost: totalCost, change };
      }),
    [],
  );

  return (
    <>
      <div className="analytics-toolbar">
        <span className="analytics-hint">
          Supply cost per unit of volume by department. Lower is better.
        </span>
      </div>

      <div className="analytics-card">
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Unit of Volume</th>
                {MONTHS.map((m, i) => (
                  <th key={m} className={`r ${i === 11 ? 'latest' : ''}`}>
                    {m}
                  </th>
                ))}
                <th className="r">Trend</th>
                <th className="r">YTD $/Unit</th>
                <th className="r">YTD Cost</th>
                <th className="r">Δ MoM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ dept, ratios, ytdRatio, ytdCost, change }) => (
                <tr key={dept.code}>
                  <td>
                    <div className="dept-name">{dept.name}</div>
                    <div className="dept-code mono">{dept.code}</div>
                  </td>
                  <td className="muted">{dept.uom}</td>
                  {ratios.map((r, i) => (
                    <td key={i} className={`r mono ${i === 11 ? 'latest' : ''}`}>
                      {fmtUsd(r)}
                    </td>
                  ))}
                  <td className="r">
                    <Sparkline values={ratios} color="#3498db" />
                  </td>
                  <td className="r mono strong">{fmtUsd(ytdRatio)}</td>
                  <td className="r mono">{fmtUsd(ytdCost)}</td>
                  <td className={`r mono ${change >= 0 ? 'neg' : 'pos'}`}>
                    {change >= 0 ? '+' : ''}
                    {fmt1(change)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="analytics-foot-note">
        <span className="material-icons" style={{ fontSize: 16, color: '#3498db' }}>
          info
        </span>
        Values are <strong>supply cost per unit</strong> of volume. Use this to spot
        volume-driven cost creep — a rising $/unit while volume is flat usually points at price
        increases or waste rather than activity.
      </div>
    </>
  );
};

export default MDA;
