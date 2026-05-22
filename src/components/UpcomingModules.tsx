import React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const UpcomingModules: React.FC = () => {
  // MUI DataGrid - Define 2 columns
  const columns: GridColDef[] = [
    { field: 'col1', headerName: 'Module Title', width: 250 },
    { field: 'col2', headerName: 'Module Description', width: 400 },
  ];

  // MUI DataGrid - Define rows with specific items
  const rows = [
    { id: 1, col1: 'FTEs', col2: '' },
    { id: 2, col1: 'Supplies per Volume metric', col2: '' },
    { id: 3, col1: 'Revenue by payer', col2: '' },
    { id: 4, col1: 'Net revenue by payer', col2: '' },
    { id: 5, col1: 'Fixed assets by net book value', col2: '' },
    { id: 6, col1: 'Volume Trends by Department', col2: '' },
    { id: 7, col1: 'Cache Management', col2: 'Connect through Plaid or Import bank statements' },
    { id: 8, col1: '', col2: '' },
    { id: 9, col1: '', col2: '' },
    { id: 10, col1: '', col2: '' },
  ];


  return (
    <div style={{
      padding: '40px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '5px'
      }}>
        <h1 style={{ margin: 0 }}>Upcoming Modules</h1>
      </div>
      <hr />

      <div style={{
        marginBottom: '15px'
      }}>
        <h2 style={{
          margin: 0,
          fontSize: '18px',
          fontWeight: 600,
          color: '#2c5364'
        }}>
          MUI Grid
        </h2>
      </div>

      <div style={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 10 },
            },
          }}
          pageSizeOptions={[10]}
          disableRowSelectionOnClick
        />
      </div>
    </div>
  );
};

export default UpcomingModules;
