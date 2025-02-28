import { PivotSheet, S2DataConfig, type S2Options } from '@antv/s2';

const s2Options: S2Options = {
  width: 600,
  height: 480,
  // 提高滚动性能
  transformCanvasConfig(renderer) {
    renderer.setConfig({
      enableCulling: true,
    });
  },
};

export function generateRawData(
  row: Record<string, number>,
  col: Record<string, number>,
) {
  const res: Record<string, any>[] = [];
  const rowKeys = Object.keys(row);
  const colKeys = Object.keys(col);

  for (let i = 0; i < row[rowKeys[0]]; i++) {
    for (let j = 0; j < row[rowKeys[1]]; j++) {
      for (let m = 0; m < col[colKeys[0]]; m++) {
        for (let n = 0; n < col[colKeys[1]]; n++) {
          res.push({
            province: `p${i}`,
            city: `c${j}`,
            type: `type${m}`,
            subType: `subType${n}`,
            number: i * n,
          });
        }
      }
    }
  }

  return res;
}

const s2DataConfig: S2DataConfig = {
  fields: {
    rows: ['type', 'subType'],
    columns: ['province', 'city'],
    values: ['number'],
  },
  data: generateRawData(
    { province: 10, city: 100 },
    { type: 10, sub_type: 100 },
  ),
};

async function bootstrap() {
  const container = document.getElementById('container');

  const s2 = new PivotSheet(container, s2DataConfig, s2Options);

  await s2.render();
}

bootstrap();
