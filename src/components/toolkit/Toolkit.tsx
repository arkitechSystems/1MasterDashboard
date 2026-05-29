/**
 * Accountant Toolkit — top-level shell with three tools. Each tool lets a
 * data-entry clerk feed in source information (vendor invoices, lease
 * terms, PDFs) and the page computes the schedule + emits the journal
 * entries the clerk needs to post. The goal is to remove the "I need an
 * accountant to figure out the JE" step from the close process.
 */

import React, { useState } from 'react';
import PrepaidsTool from './PrepaidsTool';
import LeasesTool from './LeasesTool';
import PDFReaderTool from './PDFReaderTool';
import './Toolkit.css';

type ToolkitTab = 'prepaids' | 'leases' | 'pdfreader';

const TABS: { id: ToolkitTab; label: string; icon: string; blurb: string }[] = [
  { id: 'prepaids',  label: 'Prepaids',    icon: 'event_repeat',
    blurb: 'Amortize a prepaid invoice across a fiscal year and emit the monthly JE.' },
  { id: 'leases',    label: 'Leases',      icon: 'description',
    blurb: 'Build an ASC 842 lease amortization schedule and emit the initial + monthly JEs.' },
  { id: 'pdfreader', label: 'PDF Reader',  icon: 'picture_as_pdf',
    blurb: 'Extract text from a PDF (bank statement, invoice) and export it to Excel.' },
];

const Toolkit: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ToolkitTab>('prepaids');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="toolkit">
      <div className="toolkit-header">
        <h1>Accountant Toolkit</h1>
        <p className="toolkit-sub">
          Tools that turn source data into ready-to-post journal entries.
          Each tool exports the JE as CSV or Excel so a clerk can paste it
          into the GL system.
        </p>
      </div>

      <div className="toolkit-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`toolkit-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="material-icons" aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="toolkit-blurb">{active.blurb}</div>

      <div className="toolkit-body">
        {activeTab === 'prepaids' && <PrepaidsTool />}
        {activeTab === 'leases' && <LeasesTool />}
        {activeTab === 'pdfreader' && <PDFReaderTool />}
      </div>
    </div>
  );
};

export default Toolkit;
