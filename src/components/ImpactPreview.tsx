import React, { useRef } from 'react';

const ImpactPreview: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    // Placeholder for download template functionality
    console.log('Download template clicked');
    // TODO: Generate and download Excel template
    alert('Template download functionality coming soon');
  };

  const handleUploadClick = () => {
    // Trigger file input click
    fileInputRef.current?.click();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('File selected:', file.name);
      // TODO: Process uploaded file
      alert(`File "${file.name}" selected. Upload processing coming soon.`);
      // Reset the input so the same file can be selected again if needed
      event.target.value = '';
    }
  };

  return (
    <div className="impact-preview">
      <h1 style={{ margin: '0 0 4px 0' }}>Impact Preview</h1>
      <hr style={{ margin: '4px 0 20px 0' }} />

      <div className="impact-preview-content" style={{ padding: '20px' }}>
        <p style={{
          fontSize: '13px',
          color: '#666',
          lineHeight: '1.6',
          marginBottom: '30px',
          padding: '15px 20px',
          background: '#f7f9fc',
          borderRadius: '8px',
          borderLeft: '4px solid #1abc9c',
          fontStyle: 'italic'
        }}>
          Use this page to upload journal entries to forecast how each entry will change your financial position before posting to your general ledger. Each entry uploaded will be shown in all tabs of this tool until you delete it so you can review the impacts of proposed journal entries before posting.
        </p>

        <div style={{
          display: 'flex',
          gap: '15px',
          marginBottom: '30px'
        }}>
          <button
            onClick={handleDownloadTemplate}
            style={{
              background: '#e8e8e8',
              color: '#202020',
              border: '1.5px solid #b8b8b8',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.1s ease',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#d8d8d8';
              e.currentTarget.style.borderColor = '#a8a8a8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#e8e8e8';
              e.currentTarget.style.borderColor = '#b8b8b8';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = '#c8c8c8';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.background = '#d8d8d8';
            }}
          >
            <span className="material-icons" style={{ fontSize: '20px' }}>download</span>
            <span>Download Upload Template</span>
          </button>

          <button
            onClick={handleUploadClick}
            style={{
              background: 'linear-gradient(145deg, #1abc9c, #16a085)',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(26, 188, 156, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            <span className="material-icons" style={{ fontSize: '20px' }}>upload</span>
            <span>Upload Entry</span>
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>

        <div style={{
          padding: '20px',
          background: '#f0f8ff',
          borderRadius: '8px',
          border: '1px solid #1abc9c'
        }}>
          <p style={{ margin: '0 0 10px 0', fontWeight: '600', color: '#2c5364' }}>
            Instructions:
          </p>
          <ol style={{ margin: '0', paddingLeft: '20px', color: '#666', lineHeight: '1.8' }}>
            <li>Click "Download Upload Template" to get the Excel template</li>
            <li>Fill in your data following the template format</li>
            <li>Click "Upload Entry" to select and upload your completed file</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default ImpactPreview;
