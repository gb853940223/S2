import { PivotSheet, S2Options } from '@antv/s2';

fetch(
  'https://gw.alipayobjects.com/os/bmw-prod/2a5dbbc8-d0a7-4d02-b7c9-34f6ca63cff6.json',
)
  .then((res) => res.json())
  .then(async (dataCfg) => {
    const container = document.getElementById('container');

    const s2Options: S2Options = {
      width: 600,
      height: 300,
      frozen: {
        rowCount: 1,
        trailingRowCount: 1,
        colCount: 1,
        trailingColCount: 1,
      },
      totals: {
        row: {
          showGrandTotals: true,
          reverseGrandTotalsLayout: true,
        },
      },
      style: {
        colCell: {
          widthByField: {
            'root[&]家具[&]沙发[&]number': 200,
            'root[&]办公用品[&]笔[&]number': 200,
          },
        },
      },
    };

    const s2 = new PivotSheet(container, dataCfg, s2Options);

    await s2.render();
  });
