---
title: 复制与导出
order: 8
---

<Playground path="interaction/basic/demo/copy-export.ts" height="500" rid='copy-export'></playground>

## 复制

### 1. 全量复制

:::warning{title="注意"}
S2 会在复制的时候往剪贴板写入两种类型的元数据

- `text/html`
- `text/plain`

粘贴的时候，取决于`接收方选择什么类型的数据`，对于富文本一般来说接收的是 `text/html`, 对于 Excel 之类的就是 `text/plain`, 即带制表符 `\t` 的纯文本，支持自定义修改。
:::

内置是三个 API, 详见 [下方文档](#api)

- `asyncGetAllData`
- `asyncGetAllPlainData`
- `asyncGetAllHtmlData`

#### 1.1 在 `@antv/s2` 中使用

```ts | pure
import { asyncGetAllData, copyToClipboard } from '@antv/s2'

// 1. 拿到表格数据
const data = await asyncGetAllData({
  sheetInstance: s2,
  split: '\t',
  formatOptions: true,
  // formatOptions: {
  //   formatHeader: true,
  //   formatData: true
  // },

  // 同步复制
  // async: false
});

// 2. 写入到剪切板 （同时包含 `text/html` 和 `text/plain`)
// 同步复制：copyToClipboard(data, false)
copyToClipboard(data)
  .then(() => {
    console.log('复制成功')
  })
  .catch(() => {
    console.log('复制失败')
  })
```

[查看示例](/examples/interaction/basic/#copy-export)

#### 1.2 在 `@antv/s2-react` 中使用

:::info{title="提示"}
组件层的复制，导出等功能，基于核心层 `@antv/s2` 透出的一系列工具方法封装，也可以根据实际业务，基于工具方法自行封装。
:::

具体请查看 [分析组件-导出](/manual/advanced/analysis/export) 章节。

##### 1.2.1 原始数据全量复制

<img alt="originFullCopy" src="https://gw.alipayobjects.com/mdn/rms_56cbb2/afts/img/A*pfSsTrvuJ0UAAAAAAAAAAAAAARQnAQ" width="1000" />

##### 1.2.2 格式化数据全量复制

如果配置了 [`S2DataConfig.meta`](/api/general/s2-data-config#meta) 对数据有 [格式化处理](/manual/basic/formatter), 那么可以开启 `withFormat`, 这样复制时会拿到格式化之后的数据。

```ts
const s2Options = {
  interaction: {
    copy: {
      // 开启复制
      enable: true,
      // 复制时携带表头
      withHeader: true,
      // 复制格式化后的数据
      withFormat: true
    }
  }
}
```

<img alt="formatFullCopy" src="https://gw.alipayobjects.com/mdn/rms_56cbb2/afts/img/A*mLSdTrAWZrwAAAAAAAAAAAAAARQnAQ" width="1000" />

### 2. 局部复制

S2 默认提供局部复制的能力，开启后，使用快捷键 `Command/Ctrl + C` 即可复制选中区域，支持 `单选/多选/刷选/区间多选`.

```ts
const s2Options = {
  interaction: {
    copy: {
      // 是否开启复制
      enable: true,
      // 复制时携带表头
      withHeader: true,
      // 复制格式化后的数据
      withFormat: true,
    },

    // 可选：圈选复制前，需要开启圈选功能
    brushSelection: {
      dataCell: true,
      rowCell: true,
      colCell: true,
    },

    // 可选：多选
    multiSelection: true
  }
};
```

#### 2.1 复制到 Excel

<img alt="excelCopy" src="https://gw.alipayobjects.com/mdn/rms_56cbb2/afts/img/A*LzTYTpFosccAAAAAAAAAAAAAARQnAQ" width="1000"/>

#### 2.2 复制带 HTML 格式

<img alt="HTMLCopy" src="https://gw.alipayobjects.com/mdn/rms_56cbb2/afts/img/A*DuHCSbpv_XkAAAAAAAAAAAAAARQnAQ" width="1000"/>

#### 2.3 复制行头内容

<img alt="CopyCol" src="https://gw.alipayobjects.com/mdn/rms_56cbb2/afts/img/A*_NukQpysLC8AAAAAAAAAAAAAARQnAQ" width="1000"/>

#### 2.4 复制列头内容

<img alt="CopyRow" src="https://gw.alipayobjects.com/mdn/rms_56cbb2/afts/img/A*ncuAQaL4AvAAAAAAAAAAAAAAARQnAQ" width="1000"/>

#### 2.5 带表头复制

开启 `withHeader` 后，复制时会携带当前选中数据对应的行列头单元格数据。

```ts
const s2Options = {
  interaction: {
    copy: {
      enable: true,
      withHeader: true,
    },
  }
};
```

<img alt="withHeader" src="https://gw.alipayobjects.com/zos/antfincdn/wSBjSYKSM/3eee7bc2-7f8e-4dd9-8836-52a978d9718a.png" width="1000"/>

### 3. 自定义数据转换

默认获取 `text/plain` 和 `text/html` 两种类型的全量表格数据，可以通过 `customTransformer` 自定义数据转换。

```ts | pure
import { asyncGetAllData } from '@antv/s2'

const data = await asyncGetAllData({
  sheetInstance: s2,
  split: '\t',
  formatOptions: true,
  customTransformer: () => {
    return {
      'text/plain': (data) => {
         return {
           type: 'text/plain',
           content: ``
         };
      },
      'text/html': (data) => {
         return {
           type: 'text/html',
           content: `<td></td>`
         };
      },
    };
  },
})
```

也可以写在 `s2Options` 中：

```ts
const s2Options = {
  interaction: {
    copy: {
      customTransformer: () => {}
    }
  }
}
```

[查看示例](/examples/interaction/basic/#copy-export)

## 导出

默认只提供 `csv` 纯文本格式的导出，如果想导出 `xlsx`, 保留单元格样式，可以结合 [exceljs](https://github.com/exceljs/exceljs), [sheetjs]( https://github.com/SheetJS/sheetjs) 等工具自行处理。

### 1. 导出 CSV

```ts | pure
import { asyncGetAllPlainData, download } from '@antv/s2'

// 拿到复制数据 (text/plain)
const data = await asyncGetAllPlainData({
  sheetInstance: s2,
  split: ',',
  formatOptions: true,
  // formatOptions: {
  //   formatHeader: true,
  //   formatData: true
  // },

  // 同步导出
  // async: false
});

// 导出数据 (csv)
download(data, 'filename') // filename.csv
```

#### API

##### asyncGetAllData

获取 `text/plain` 和 `text/html` 两种类型的数据，用于复制

```ts
[
  {
    "type": "text/plain",
    "content": "省份、t 城市、t 类别、r\n 浙江省、t 杭州市、t 家具、r\n 浙江省、t 绍兴市、t 家具"
  },
  {
    "type": "text/html",
    "content": "<meta charset=\"utf-8\"><table><tbody><tr><td>省份</td><td>城市</td><td>类别</td></tr><tr><td>浙江省</td><td>杭州市</td><td>家具</td></tr><tr><td>浙江省</td><td>绍兴市</td><td>家具</td></tr></tbody></table>"
  }
]
```

##### asyncGetAllPlainData

获取 `text/plain` 类型的数据，用于导出

```ts
"省份、t 城市、t 类别、r\n 浙江省、t 杭州市、t 家具、r\n 浙江省、t 绍兴市、t 家具"
```

##### asyncGetAllHtmlData

获取 `text/html` 类型的数据，用于导出

```ts
"<meta charset=\"utf-8\"><table><tbody><tr><td>省份</td><td>城市</td><td>类别</td></tr><tr><td>浙江省</td><td>杭州市</td><td>家具</td></tr><tr><td>浙江省</td><td>绍兴市</td><td>家具</td></tr></tbody></table>"
```

| 参数          | 说明      | 类型              | 默认值           | 必选 |
| ------------|-----------------|---------------|---------------| --- |
| sheetInstance | s2 实例    | [SpreadSheet](/api/basic-class/spreadsheet)     |      | ✓    |
| split       | 分隔符    | `string`       |     | ✓    |
| formatOptions  | 是否使用 [S2DataConfig.Meta](/api/general/s2-data-config#meta) 进行格式化，可以分别对数据单元格和行列头进行格式化，传 `boolean` 会同时对单元格和行列头生效。 | `boolean \|  { formatHeader?: boolean, formatData?: boolean }`| `true`  |      |
| customTransformer  | 导出时支持自定义 (transformer) 数据导出格式化方法  | (transformer: `Transformer`) => [`Partial<Transformer>`](#transformer)      |  |      |
| async  | 是否异步复制/导出（当浏览器不支持 `requestIdleCallback` 时，会强制降级为**同步**)       | boolean      | `true`         |      |

##### copyToClipboard

| 参数 | 说明     | 类型     | 默认值 | 必选 |
| --- | --- | ------- | ----- | --- |
| data | 数据源 | `string` |        | ✓    |
| async | 是否异步复制数据（默认异步） | `boolean` |   `true`     |     |

##### download

| 参数     | 说明     | 类型     | 默认值 | 必选 |
| ------- | ------- | ------- | ----- | --- |
| data     | 数据源 | `string` |        | ✓    |
| filename | 文件名称 | `string` |        | ✓    |

##### CopyMIMEType

```ts
enum CopyMIMEType {
  PLAIN = 'text/plain',
  HTML = 'text/html',
}
```

##### FormatOptions

```ts
type FormatOptions =
  | boolean
  | {
      formatHeader?: boolean;
      formatData?: boolean;
    };
```

##### CopyAllDataParams

```ts
interface CopyAllDataParams {
  sheetInstance: SpreadSheet;
  split?: string;
  formatOptions?: FormatOptions;
  customTransformer?: (transformer: Transformer) => Partial<Transformer>;
  async?: boolean;
}
```

##### Transformer

```ts | pure
type CopyablePlain = {
  type: CopyMIMEType.PLAIN;
  content: string;
};

type CopyableHTML = {
  type: CopyMIMEType.HTML;
  content: string;
};

type MatrixPlainTransformer = (
  data: DataItem[][],
  separator?: string,
) => CopyablePlain;

type MatrixHTMLTransformer = (data: DataItem[][]) => CopyableHTML;

interface Transformer {
  [CopyMIMEType.PLAIN]: MatrixPlainTransformer;
  [CopyMIMEType.HTML]: MatrixHTMLTransformer;
}
```

| 参数 | 说明     | 类型                       | 默认值 | 必选 |
| --- | --- |--------------------------|-----| --- |
| type | 复制内容的 MIMEType | [`CopyMIMEType`](#copymimetype)           |     | ✓    |
| transformer | 处理函数 | `MatrixHTMLTransformer \| MatrixPlainTransformer`   |      |   ✓   |
