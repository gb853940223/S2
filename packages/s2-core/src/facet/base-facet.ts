import {
  FederatedWheelEvent,
  Group,
  Rect,
  type FederatedPointerEvent as GraphEvent,
} from '@antv/g';
import { interpolateArray } from 'd3-interpolate';
import { timer, type Timer } from 'd3-timer';
import {
  clamp,
  compact,
  concat,
  debounce,
  each,
  filter,
  find,
  get,
  includes,
  isArray,
  isEmpty,
  isFunction,
  isNil,
  isNumber,
  isUndefined,
  last,
  max,
  maxBy,
  reduce,
  size,
  sumBy,
} from 'lodash';
import {
  ColCell,
  CornerCell,
  DataCell,
  MergedCell,
  RowCell,
  SeriesNumberCell,
  TableColCell,
  TableSeriesNumberCell,
  type HeaderCell,
} from '../cell';
import {
  BACK_GROUND_GROUP_CONTAINER_Z_INDEX,
  CellType,
  DEFAULT_STYLE,
  EXTRA_FIELD,
  FRONT_GROUND_GROUP_CONTAINER_Z_INDEX,
  InterceptType,
  KEY_GROUP_BACK_GROUND,
  KEY_GROUP_COL_RESIZE_AREA,
  KEY_GROUP_CORNER_RESIZE_AREA,
  KEY_GROUP_FORE_GROUND,
  KEY_GROUP_PANEL_GROUND,
  KEY_GROUP_PANEL_SCROLL,
  KEY_GROUP_ROW_INDEX_RESIZE_AREA,
  KEY_GROUP_ROW_RESIZE_AREA,
  NODE_ID_SEPARATOR,
  OriginEventType,
  PANEL_GROUP_GROUP_CONTAINER_Z_INDEX,
  PANEL_GROUP_SCROLL_GROUP_Z_INDEX,
  S2Event,
  ScrollDirection,
  ScrollbarPositionType,
} from '../common/constant';
import { DEFAULT_PAGE_INDEX } from '../common/constant/pagination';
import {
  DEBUG_HEADER_LAYOUT,
  DEBUG_VIEW_RENDER,
  DebuggerUtil,
} from '../common/debug';
import {
  CornerNodeType,
  type AdjustLeafNodesParams,
  type CellCallbackParams,
  type CellCustomSize,
  type FrameConfig,
  type GridInfo,
  type HiddenColumnsInfo,
  type LayoutResult,
  type S2CellType,
  type ScrollChangeParams,
  type ScrollOffsetConfig,
  type SimpleData,
  type ViewMeta,
} from '../common/interface';
import type {
  CellScrollOffset,
  CellScrollPosition,
  ScrollOffset,
} from '../common/interface/scroll';
import { PanelScrollGroup } from '../group/panel-scroll-group';
import type { SpreadSheet } from '../sheet-type';
import { ScrollBar, ScrollType } from '../ui/scrollbar';
import type { SelectedIds } from '../utils';
import { getAdjustedRowScrollX, getAdjustedScrollOffset } from '../utils/facet';
import { getAllChildCells } from '../utils/get-all-child-cells';
import { getColsForGrid, getRowsForGrid } from '../utils/grid';
import { diffPanelIndexes, type PanelIndexes } from '../utils/indexes';
import { isMobile, isWindows } from '../utils/is-mobile';
import { floor, round } from '../utils/math';
import { CornerBBox } from './bbox/corner-bbox';
import { PanelBBox } from './bbox/panel-bbox';
import {
  ColHeader,
  CornerHeader,
  Frame,
  RowHeader,
  SeriesNumberHeader,
  type BaseHeaderConfig,
  type RowHeaderConfig,
} from './header';
import type { TableColHeader } from './header/table-col';
import type { Hierarchy } from './layout/hierarchy';
import type { ViewCellHeights } from './layout/interface';
import { Node } from './layout/node';
import { WheelEvent as MobileWheel } from './mobile/wheelEvent';
import {
  areAllFieldsEmpty,
  getCellRange,
  optimizeScrollXY,
  translateGroup,
} from './utils';

export abstract class BaseFacet {
  // spreadsheet instance
  public spreadsheet: SpreadSheet;

  // corner box
  public cornerBBox: CornerBBox;

  // viewport cells box
  public panelBBox: PanelBBox;

  // background (useless now)
  public backgroundGroup: Group;

  // render viewport cell
  public panelGroup: Group;

  public panelScrollGroup: PanelScrollGroup;

  // render header/corner/scrollbar/resize
  public foregroundGroup: Group;

  /**
   * 当前布局节点信息
   * @private 内部消费, 外部调用请使用 facet.getLayoutResult()
   */
  protected layoutResult: LayoutResult;

  public viewCellWidths: number[];

  public viewCellHeights: ViewCellHeights;

  protected mobileWheel: MobileWheel;

  protected timer: Timer;

  public hScrollBar: ScrollBar;

  public hRowScrollBar: ScrollBar;

  public vScrollBar: ScrollBar;

  public rowHeader: RowHeader | null;

  public columnHeader: ColHeader | TableColHeader;

  public cornerHeader: CornerHeader;

  public seriesNumberHeader: SeriesNumberHeader | null;

  public centerFrame: Frame;

  public gridInfo: GridInfo;

  protected textWrapNodeHeightCache: Map<string, number>;

  protected textWrapTempCornerCell: CornerCell | null;

  protected textWrapTempRowCell: RowCell | DataCell;

  protected textWrapTempColCell: ColCell | TableColCell;

  public customRowHeightStatusMap: Record<string, boolean>;

  protected abstract getCornerCellInstance(
    node: Node,
    spreadsheet: SpreadSheet,
    config: Partial<BaseHeaderConfig>,
  ): CornerCell | null;

  protected abstract getRowCellInstance(
    node: Node | ViewMeta,
    spreadsheet: SpreadSheet,
    config: Partial<BaseHeaderConfig>,
  ): RowCell | DataCell;

  protected abstract getColCellInstance(
    node: Node,
    spreadsheet: SpreadSheet,
    config: Partial<BaseHeaderConfig>,
  ): ColCell;

  protected abstract doLayout(): LayoutResult;

  protected abstract clip(scrollX: number, scrollY: number): void;

  public abstract calculateXYIndexes(
    scrollX: number,
    scrollY: number,
  ): PanelIndexes;

  public abstract getViewCellHeights(
    layoutResult?: LayoutResult,
  ): ViewCellHeights;

  public abstract getViewCellHeights(): ViewCellHeights;

  public abstract addDataCell(cell: DataCell): void;

  public abstract getCellMeta(
    rowIndex: number,
    colIndex: number,
  ): ViewMeta | null;

  public abstract getContentWidth(): number;

  public abstract getContentHeight(): number;

  protected scrollFrameId: ReturnType<typeof requestAnimationFrame> | null =
    null;

  protected scrollDirection: ScrollDirection;

  get scrollBarTheme() {
    return this.spreadsheet.theme.scrollBar;
  }

  get scrollBarSize() {
    return this.scrollBarTheme?.size!;
  }

  protected preCellIndexes: PanelIndexes | null;

  public constructor(spreadsheet: SpreadSheet) {
    this.spreadsheet = spreadsheet;
    this.init();
  }

  protected shouldRender() {
    return !areAllFieldsEmpty(this.spreadsheet.dataCfg.fields);
  }

  public getLayoutResult = (): LayoutResult => {
    return {
      ...this.layoutResult,
      cornerNodes: this.getCornerNodes(),
      seriesNumberNodes: this.getSeriesNumberNodes(),
    };
  };

  protected initTextWrapTemp() {
    const node = {} as Node;
    const args: CellCallbackParams = [
      node,
      this.spreadsheet,
      { shallowRender: true } as BaseHeaderConfig,
    ];

    this.textWrapTempRowCell = this.getRowCellInstance(...args);
    this.textWrapTempColCell = this.getColCellInstance(...args);
    this.textWrapTempCornerCell = this.getCornerCellInstance?.(...args);
    this.textWrapNodeHeightCache = new Map();
    this.customRowHeightStatusMap = {};
  }

  protected initGroups() {
    this.initBackgroundGroup();
    this.initPanelGroups();
    this.initForegroundGroup();
  }

  protected initForegroundGroup() {
    this.foregroundGroup = this.spreadsheet.container.appendChild(
      new Group({
        name: KEY_GROUP_FORE_GROUND,
        style: { zIndex: FRONT_GROUND_GROUP_CONTAINER_Z_INDEX },
      }),
    );
  }

  protected initBackgroundGroup() {
    this.backgroundGroup = this.spreadsheet.container.appendChild(
      new Group({
        name: KEY_GROUP_BACK_GROUND,
        style: { zIndex: BACK_GROUND_GROUP_CONTAINER_Z_INDEX },
      }),
    );
  }

  protected initPanelGroups() {
    this.panelGroup = this.spreadsheet.container.appendChild(
      new Group({
        name: KEY_GROUP_PANEL_GROUND,
        style: { zIndex: PANEL_GROUP_GROUP_CONTAINER_Z_INDEX },
      }),
    );
    this.panelScrollGroup = new PanelScrollGroup({
      name: KEY_GROUP_PANEL_SCROLL,
      zIndex: PANEL_GROUP_SCROLL_GROUP_Z_INDEX,
      s2: this.spreadsheet,
    });
    this.panelGroup.appendChild(this.panelScrollGroup);
  }

  public getCellCustomSize(node: Node | null, customSize: CellCustomSize) {
    return isFunction(customSize) ? customSize(node) : customSize;
  }

  protected getRowCellDraggedWidth(node: Node): number | undefined {
    const { rowCell } = this.spreadsheet.options.style!;

    return (
      rowCell?.widthByField?.[node?.id] ?? rowCell?.widthByField?.[node?.field]
    );
  }

  protected getRowCellDraggedHeight(node: Node): number | undefined {
    const { rowCell } = this.spreadsheet.options.style!;

    return (
      rowCell?.heightByField?.[node?.id] ??
      rowCell?.heightByField?.[node?.field]
    );
  }

  protected isCustomRowCellHeight(node: Node) {
    const { dataCell } = this.spreadsheet.options.style!;
    const defaultDataCellHeight = DEFAULT_STYLE.dataCell?.height;

    return (
      isNumber(this.getCustomRowCellHeight(node)) ||
      dataCell?.height !== defaultDataCellHeight
    );
  }

  protected getCustomRowCellHeight(node: Node) {
    const { rowCell } = this.spreadsheet.options.style!;

    return (
      this.getRowCellDraggedHeight(node) ??
      this.getCellCustomSize(node, rowCell?.height)
    );
  }

  protected getRowCellHeight(node: Node): number | undefined {
    const { dataCell } = this.spreadsheet.options.style!;

    // 优先级: 行头拖拽 > 行头自定义高度 > 通用单元格高度
    return this.getCustomRowCellHeight(node) ?? dataCell?.height;
  }

  protected getColCellDraggedWidth(node: Node): number | undefined {
    const { colCell } = this.spreadsheet.options.style!;

    // 指标的 field 是 $$extra$$, 对用户来说其实是 s2DataConfig.fields.values 里面的 field
    // 此时应该按 $$extra$$ 对应的 value field 匹配
    return (
      colCell?.widthByField?.[node?.id] ??
      colCell?.widthByField?.[node?.field] ??
      colCell?.widthByField?.[node?.query?.[EXTRA_FIELD]]
    );
  }

  protected getColCellDraggedHeight(node: Node): number | undefined {
    const { colCell } = this.spreadsheet.options.style!;

    // 高度同理
    return (
      colCell?.heightByField?.[node?.id] ??
      colCell?.heightByField?.[node?.field] ??
      colCell?.heightByField?.[node?.query?.[EXTRA_FIELD]]
    );
  }

  protected getColNodeHeight(options: {
    colNode: Node;
    colsHierarchy: Hierarchy;
    useCache?: boolean;
    cornerNodes?: Node[];
  }) {
    const {
      colNode,
      colsHierarchy,
      useCache = true,
      cornerNodes = [],
    } = options;

    if (!colNode) {
      return 0;
    }

    const { colCell: colCellStyle, cornerCell: cornerCellStyle } =
      this.spreadsheet.options.style!;
    // 优先级: 列头拖拽 > 列头自定义高度 > 多行文本自适应高度 > 通用单元格高度
    const height =
      this.getColCellDraggedHeight(colNode) ??
      this.getCellCustomSize(colNode, colCellStyle?.height);

    if (isNumber(height) && height !== DEFAULT_STYLE.colCell?.height) {
      // 标记为自定义高度, 方便计算文本 maxLines
      colNode.extra.isCustomHeight = true;

      return height;
    }

    const isEnableColNodeHeightAdaptive =
      colCellStyle?.maxLines! > 1 && colCellStyle?.wordWrap;
    const isEnableCornerNodeHeightAdaptive =
      cornerCellStyle?.maxLines! > 1 && cornerCellStyle?.wordWrap;
    const defaultHeight = this.getDefaultColNodeHeight(colNode, colsHierarchy);

    let colAdaptiveHeight = defaultHeight;
    let cornerAdaptiveHeight = defaultHeight;

    // 1. 列头开启自动换行, 计算列头自适应高度
    if (isEnableColNodeHeightAdaptive) {
      colAdaptiveHeight = this.getNodeAdaptiveHeight({
        meta: colNode,
        cell: this.textWrapTempColCell,
        defaultHeight,
        useCache,
      });
    }

    /**
     * 2. 角头开启自动换行, 列头的高度除了自身以外, 还需要考虑当前整行对应的角头
     * 存在角头/列头同时换行, 只有角头换行, 只有列头换行等多种场景
     */
    if (isEnableCornerNodeHeightAdaptive) {
      const currentCornerNodes = cornerNodes.filter((node) => {
        // 兼容数值置于行/列的不同场景
        if (colNode.isLeaf) {
          return node.cornerType === CornerNodeType.Row;
        }

        return node.field === colNode.field;
      });

      if (!isEmpty(currentCornerNodes)) {
        cornerAdaptiveHeight = max(
          currentCornerNodes.map((cornerNode) =>
            this.getNodeAdaptiveHeight({
              meta: cornerNode,
              cell: this.textWrapTempCornerCell!,
              defaultHeight,
              useCache: false,
            }),
          ),
        );
      }
    }

    // 两者要取最大, 保证高度自动撑高的合理性
    return round(
      Math.max(cornerAdaptiveHeight, colAdaptiveHeight, defaultHeight),
    );
  }

  protected getDefaultColNodeHeight(
    colNode: Node,
    colsHierarchy: Hierarchy,
  ): number {
    if (!colNode) {
      return 0;
    }

    const { colCell } = this.spreadsheet.options.style!;

    // 当前层级高度最大的单元格
    const sampleMaxHeight =
      colsHierarchy?.sampleNodesForAllLevels?.find(
        (node) => node.level === colNode.level,
      )?.height || 0;

    // 优先级: 列头拖拽 > 列头自定义高度 > 通用单元格高度
    const defaultHeight =
      this.getColCellDraggedHeight(colNode) ??
      this.getCellCustomSize(colNode, colCell?.height) ??
      0;

    return round(Math.max(defaultHeight, sampleMaxHeight));
  }

  protected getNodeAdaptiveHeight(options: {
    meta: Node | ViewMeta;
    cell: S2CellType;
    defaultHeight?: number;
    useCache?: boolean;
  }) {
    const { meta, cell, defaultHeight = 0, useCache = true } = options;

    if (!meta || !cell) {
      return defaultHeight;
    }

    // 共用一个单元格用于测量, 通过动态更新 meta 的方式, 避免数据量大时频繁实例化触发 GC
    cell.setMeta({ ...meta, shallowRender: true } as Node & ViewMeta);

    const fieldValue = String(cell.getFieldValue());

    if (!fieldValue) {
      return defaultHeight;
    }

    const maxTextWidth = Math.ceil(cell.getMaxTextWidth());
    // 相同文本长度, 并且单元格宽度一致, 无需再计算换行高度, 使用缓存
    const cacheKey = `${size(fieldValue)}${NODE_ID_SEPARATOR}${maxTextWidth}`;
    const cacheHeight = this.textWrapNodeHeightCache.get(cacheKey);

    if (cacheHeight && useCache) {
      return cacheHeight || defaultHeight;
    }

    // 预生成 icon 配置, 用于计算文本正确的最大可用宽度
    (cell as HeaderCell).generateIconConfig?.();
    cell.drawTextShape();

    const { padding } = cell.getStyle().cell;
    const textHeight = cell.getActualTextHeight();
    const adaptiveHeight = textHeight + padding.top + padding.bottom;

    const height =
      cell.isMultiLineText() && textHeight >= defaultHeight
        ? adaptiveHeight
        : defaultHeight;

    this.textWrapNodeHeightCache.set(cacheKey, height);

    return height;
  }

  /**
   * 根据叶子节点宽度计算所有父级节点宽度和 x 坐标
   */
  protected calculateColParentNodeWidthAndX(colLeafNodes: Node[]) {
    let prevColParent: Node | null = null;
    let i = 0;

    const leafNodes = colLeafNodes.slice(0);

    while (i < leafNodes.length) {
      const node = leafNodes[i++];
      const parentNode = node?.parent;

      if (prevColParent !== parentNode && parentNode) {
        leafNodes.push(parentNode);

        const firstVisibleChildNode = parentNode.children?.find(
          (childNode) => childNode.width,
        );
        // 父节点 x 坐标 = 第一个未隐藏的子节点的 x 坐标
        const parentNodeX = firstVisibleChildNode?.x || 0;
        // 父节点宽度 = 所有子节点宽度之和
        const parentNodeWidth = sumBy(parentNode.children, 'width');

        parentNode.x = parentNodeX;
        parentNode.width = parentNodeWidth;

        prevColParent = parentNode;
      }
    }
  }

  /**
   * 将每一层级的采样节点更新为高度最大的节点 (未隐藏, 非汇总节点)
   */
  protected updateColsHierarchySampleMaxHeightNodes(
    colsHierarchy: Hierarchy,
    rowsHierarchy?: Hierarchy,
  ) {
    const sampleMaxHeightNodesForAllLevels =
      colsHierarchy.sampleNodesForAllLevels.map((sampleNode) => {
        const maxHeightNode = maxBy(
          colsHierarchy
            .getNodes(sampleNode.level)
            .filter((node) => !node.isTotals),
          (levelSampleNode) => {
            return this.getColNodeHeight({
              colNode: levelSampleNode,
              colsHierarchy,
            });
          },
        )!;

        return maxHeightNode!;
      });

    colsHierarchy.sampleNodesForAllLevels = compact(
      sampleMaxHeightNodesForAllLevels,
    );

    const cornerNodes = rowsHierarchy
      ? CornerHeader.getCornerNodes({
          position: { x: 0, y: 0 },
          width: rowsHierarchy.width,
          height: colsHierarchy.height,
          layoutResult: {
            rowsHierarchy,
            colsHierarchy,
          } as LayoutResult,
          seriesNumberWidth: this.getSeriesNumberWidth(),
          spreadsheet: this.spreadsheet,
        })
      : [];

    colsHierarchy.sampleNodesForAllLevels.forEach((levelSampleNode) => {
      levelSampleNode.height = this.getColNodeHeight({
        colNode: levelSampleNode,
        colsHierarchy,
        cornerNodes,
      });

      if (levelSampleNode.level === 0) {
        levelSampleNode.y = 0;
      } else {
        const preLevelSample = colsHierarchy.sampleNodesForAllLevels[
          levelSampleNode.level - 1
        ] ?? {
          y: 0,
          height: 0,
        };

        levelSampleNode.y = preLevelSample.y + preLevelSample.height;
      }

      colsHierarchy.height += levelSampleNode.height;
    });
    colsHierarchy.rootNode.height = colsHierarchy.height;
  }

  hideScrollBar = () => {
    this.hRowScrollBar?.setAttribute('visibility', 'hidden');
    this.hScrollBar?.setAttribute('visibility', 'hidden');
    this.vScrollBar?.setAttribute('visibility', 'hidden');
  };

  delayHideScrollBar = debounce(this.hideScrollBar, 1000);

  delayHideScrollbarOnMobile = () => {
    if (isMobile()) {
      this.delayHideScrollBar();
    }
  };

  showVerticalScrollBar = () => {
    this.vScrollBar?.setAttribute('visibility', 'visible');
  };

  showHorizontalScrollBar = () => {
    this.hRowScrollBar?.setAttribute('visibility', 'visible');
    this.hScrollBar?.setAttribute('visibility', 'visible');
  };

  onContainerWheelForMobileCompatibility = () => {
    const canvas = this.spreadsheet.getCanvasElement();
    let startY: number;
    let endY: number;

    canvas.addEventListener('touchstart', (event) => {
      startY = event.touches[0].clientY;
    });

    canvas.addEventListener('touchend', (event) => {
      endY = event.changedTouches[0].clientY;
      if (endY < startY) {
        this.scrollDirection = ScrollDirection.SCROLL_UP;
      } else if (endY > startY) {
        this.scrollDirection = ScrollDirection.SCROLL_DOWN;
      }
    });
  };

  onContainerWheel = () => {
    if (isMobile()) {
      this.onContainerWheelForMobile();
    } else {
      this.onContainerWheelForPc();
    }
  };

  // g-gesture@1.0.1 手指快速往上滚动时, deltaY 有时会为负数, 导致向下滚动时然后回弹, 看起来就像表格在抖动, 需要判断滚动方向, 修正一下.
  getMobileWheelDeltaY = (deltaY: number) => {
    if (this.scrollDirection === ScrollDirection.SCROLL_UP) {
      return Math.max(0, deltaY);
    }

    if (this.scrollDirection === ScrollDirection.SCROLL_DOWN) {
      return Math.min(0, deltaY);
    }

    return deltaY;
  };

  onContainerWheelForPc = () => {
    const canvas = this.spreadsheet.getCanvasElement();

    canvas?.addEventListener('wheel', this.onWheel);
  };

  onContainerWheelForMobile = () => {
    this.mobileWheel = new MobileWheel(this.spreadsheet.container);
    this.mobileWheel.on('wheel', (ev: FederatedWheelEvent) => {
      this.spreadsheet.hideTooltip();
      const originEvent = ev.originalEvent;
      const { deltaX, deltaY: defaultDeltaY, x, y } = ev;
      const deltaY = this.getMobileWheelDeltaY(defaultDeltaY);

      this.onWheel({
        ...originEvent,
        deltaX,
        deltaY,
        offsetX: x,
        offsetY: y,
      } as unknown as WheelEvent);
    });

    this.onContainerWheelForMobileCompatibility();
  };

  bindEvents = () => {
    this.onContainerWheel();
    this.emitPaginationEvent();
  };

  public render() {
    if (!this.shouldRender()) {
      return;
    }

    this.adjustScrollOffset();
    this.renderHeaders();
    this.renderScrollBars();
    this.renderBackground();
    this.dynamicRenderCell(true);
  }

  /**
   * 在每次render, 校验scroll offset是否在合法范围中
   * 比如在滚动条已经滚动到100%的状态的前提下：（ maxAvailableScrollOffsetX = colsHierarchy.width - viewportBBox.width ）
   *     此时changeSheetSize，sheet从 small width 变为 big width
   *     导致后者 viewport 区域更大，其结果就是后者的 maxAvailableScrollOffsetX 更小
   *     此时就需要重置 scrollOffsetX，否则就会导致滚动过多，出现空白区域
   */
  protected adjustScrollOffset() {
    const offset = this.getAdjustedScrollOffset(this.getScrollOffset());

    this.setScrollOffset(offset);
  }

  public getSeriesNumberWidth(): number {
    const { seriesNumber } = this.spreadsheet.options;

    return round(
      seriesNumber?.enable
        ? this.spreadsheet.theme.rowCell?.seriesNumberWidth ?? 0
        : 0,
    );
  }

  public getCanvasSize() {
    const { width = 0, height = 0 } = this.spreadsheet.options!;

    return {
      width,
      height,
    };
  }

  /**
   * @alias s2.interaction.scrollTo(offsetConfig)
   */
  public updateScrollOffset(offsetConfig: ScrollOffsetConfig) {
    if (offsetConfig.rowHeaderOffsetX?.value !== undefined) {
      if (offsetConfig.rowHeaderOffsetX?.animate) {
        this.scrollWithAnimation(offsetConfig);
      } else {
        this.scrollImmediately(offsetConfig);
      }

      return;
    }

    if (offsetConfig.offsetX?.value !== undefined) {
      if (offsetConfig.offsetX?.animate) {
        this.scrollWithAnimation(offsetConfig);
      } else {
        this.scrollImmediately(offsetConfig);
      }

      return;
    }

    if (offsetConfig.offsetY?.value !== undefined) {
      if (offsetConfig.offsetY?.animate) {
        this.scrollWithAnimation(offsetConfig);
      } else {
        this.scrollImmediately(offsetConfig);
      }
    }
  }

  public getPaginationScrollY(): number {
    const { pagination } = this.spreadsheet.options!;

    if (pagination) {
      const { current = DEFAULT_PAGE_INDEX, pageSize } = pagination;
      const heights = this.viewCellHeights;
      const offset = Math.max((current - 1) * pageSize, 0);

      return heights.getCellOffsetY(offset);
    }

    return 0;
  }

  public destroy() {
    this.unbindEvents();
    this.clearAllGroup();
    this.preCellIndexes = null;
    this.customRowHeightStatusMap = {};
    this.textWrapNodeHeightCache.clear();
    cancelAnimationFrame(this.scrollFrameId!);
  }

  public setScrollOffset = (scrollOffset: ScrollOffset) => {
    Object.keys(scrollOffset || {}).forEach((key) => {
      const offset = get(scrollOffset, key);

      if (!isUndefined(offset)) {
        this.spreadsheet.store.set(key, floor(offset));
      }
    });
  };

  public getScrollOffset = (): Required<ScrollOffset> => {
    const { store } = this.spreadsheet;

    return {
      scrollX: store.get<keyof ScrollOffset>('scrollX', 0),
      scrollY: store.get<keyof ScrollOffset>('scrollY', 0),
      rowHeaderScrollX: store.get<keyof ScrollOffset>('rowHeaderScrollX', 0),
    };
  };

  public resetScrollX = () => {
    this.setScrollOffset({ scrollX: 0 });
  };

  public resetRowScrollX = () => {
    this.setScrollOffset({ rowHeaderScrollX: 0 });
  };

  public resetScrollY = () => {
    this.setScrollOffset({ scrollY: 0 });
  };

  public resetScrollOffset = () => {
    this.setScrollOffset({ scrollX: 0, scrollY: 0, rowHeaderScrollX: 0 });
  };

  emitPaginationEvent = () => {
    const { pagination } = this.spreadsheet.options!;

    if (pagination) {
      const { current = DEFAULT_PAGE_INDEX, pageSize } = pagination;
      const total = this.viewCellHeights.getTotalLength();

      const pageCount = floor((total - 1) / pageSize) + 1;

      this.spreadsheet.emit(S2Event.LAYOUT_PAGINATION, {
        pageSize,
        pageCount,
        total,
        current,
      });
    }
  };

  protected unbindEvents = () => {
    const canvas = this.spreadsheet.getCanvasElement();

    canvas?.removeEventListener('wheel', this.onWheel);
    this.mobileWheel?.destroy();
  };

  calculateCellWidthHeight = () => {
    const { colLeafNodes } = this.layoutResult;
    const widths = reduce(
      colLeafNodes,
      (result: number[], node: Node) => {
        const width = last(result) || 0;

        result.push(width + node.width);

        return result;
      },
      [0],
    );

    this.viewCellWidths = widths;
    this.viewCellHeights = this.getViewCellHeights();
  };

  /**
   * 提供给明细表做 rowOffsets 计算的 hook
   */
  protected abstract calculateRowOffsets(): void;

  getRealScrollX = (scrollX: number, hRowScroll = 0) =>
    this.spreadsheet.isFrozenRowHeader() ? hRowScroll : scrollX;

  protected calculateCornerBBox() {
    this.cornerBBox = new CornerBBox(this, true);
  }

  protected calculatePanelBBox() {
    this.panelBBox = new PanelBBox(this, true);
  }

  getRealWidth = (): number => last(this.viewCellWidths) || 0;

  getCellRange() {
    const { pagination } = this.spreadsheet.options!;

    return getCellRange(this.viewCellHeights, pagination);
  }

  getRealHeight = (): number => {
    const { pagination } = this.spreadsheet.options!;
    const heights = this.viewCellHeights;

    if (pagination) {
      const { start, end } = this.getCellRange();

      return heights.getCellOffsetY(end + 1) - heights.getCellOffsetY(start);
    }

    return heights.getTotalHeight();
  };

  public clearAllGroup() {
    const { children = [] } = this.panelGroup;

    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];

      if (child instanceof Group) {
        child.removeChildren();
      } else {
        children[i].remove();
      }
    }

    this.foregroundGroup.removeChildren();
    this.backgroundGroup.removeChildren();
  }

  scrollWithAnimation = (
    offsetConfig: ScrollOffsetConfig = {},
    duration = 200,
    cb?: () => void,
  ) => {
    const {
      scrollX: adjustedScrollX,
      scrollY: adjustedScrollY,
      rowHeaderScrollX: adjustedRowScrollX,
    } = this.getAdjustedScrollOffset({
      scrollX: offsetConfig.offsetX?.value || 0,
      scrollY: offsetConfig.offsetY?.value || 0,
      rowHeaderScrollX: offsetConfig.rowHeaderOffsetX?.value || 0,
    });

    this.timer?.stop();

    const scrollOffset = this.getScrollOffset();

    const newOffset: number[] = [
      adjustedScrollX ?? scrollOffset.scrollX,
      adjustedScrollY ?? scrollOffset.scrollY,
      adjustedRowScrollX ?? scrollOffset.rowHeaderScrollX,
    ];
    const interpolate = interpolateArray(
      Object.values(scrollOffset),
      newOffset,
    );

    this.timer = timer((elapsed) => {
      try {
        const ratio = Math.min(elapsed / duration, 1);
        const [scrollX, scrollY, rowHeaderScrollX] = interpolate(ratio);

        this.setScrollOffset({
          rowHeaderScrollX,
          scrollX,
          scrollY,
        });
        this.startScroll(offsetConfig?.skipScrollEvent);

        if (elapsed > duration) {
          this.timer.stop();
          cb?.();
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        this.timer.stop();
      }
    });
  };

  scrollImmediately = (offsetConfig: ScrollOffsetConfig = {}) => {
    const { scrollX, scrollY, rowHeaderScrollX } = this.getAdjustedScrollOffset(
      {
        scrollX: offsetConfig.offsetX?.value || 0,
        scrollY: offsetConfig.offsetY?.value || 0,
        rowHeaderScrollX: offsetConfig.rowHeaderOffsetX?.value || 0,
      },
    );

    this.setScrollOffset({ scrollX, scrollY, rowHeaderScrollX });
    this.startScroll(offsetConfig?.skipScrollEvent);
  };

  /**
   * @param skipScrollEvent 不触发 S2Event.GLOBAL_SCROLL
   */
  startScroll = (skipScrollEvent = false) => {
    const { rowHeaderScrollX, scrollX, scrollY } = this.getScrollOffset();

    this.hRowScrollBar?.onlyUpdateThumbOffset(
      this.getScrollBarOffset(rowHeaderScrollX, this.hRowScrollBar),
    );

    this.hScrollBar?.onlyUpdateThumbOffset(
      this.getScrollBarOffset(scrollX, this.hScrollBar),
    );

    this.vScrollBar?.onlyUpdateThumbOffset(
      this.getScrollBarOffset(scrollY, this.vScrollBar),
    );
    this.dynamicRenderCell(skipScrollEvent);
  };

  protected getRendererHeight = () => {
    const { start, end } = this.getCellRange();

    return (
      this.viewCellHeights.getCellOffsetY(end + 1) -
      this.viewCellHeights.getCellOffsetY(start)
    );
  };

  protected getAdjustedScrollOffset = ({
    scrollX,
    scrollY,
    rowHeaderScrollX,
  }: ScrollOffset): ScrollOffset => {
    return {
      scrollX: getAdjustedScrollOffset(
        scrollX!,
        this.layoutResult.colsHierarchy.width,
        this.panelBBox.width,
      ),
      scrollY: getAdjustedScrollOffset(
        scrollY!,
        this.getRendererHeight(),
        this.panelBBox.height,
      ),
      rowHeaderScrollX: getAdjustedRowScrollX(
        rowHeaderScrollX!,
        this.cornerBBox,
      ),
    };
  };

  protected renderRowScrollBar(rowHeaderScrollX: number) {
    if (
      this.spreadsheet.isFrozenRowHeader() &&
      this.cornerBBox.width < this.cornerBBox.originalWidth
    ) {
      const maxOffset = this.cornerBBox.originalWidth - this.cornerBBox.width;
      const { maxY } = this.getScrollbarPosition();
      const { splitLine, scrollBar } = this.spreadsheet.theme;

      const thumbSize = Math.max(
        (this.cornerBBox.width * this.cornerBBox.width) /
          this.cornerBBox.originalWidth,
        scrollBar?.thumbHorizontalMinSize!,
      );

      // 行头有分割线, 滚动条应该预留分割线的宽度
      const displayThumbSize = thumbSize - splitLine?.verticalBorderWidth!;

      this.hRowScrollBar = new ScrollBar({
        isHorizontal: true,
        trackLen: this.cornerBBox.width,
        thumbLen: displayThumbSize,
        position: {
          x: this.cornerBBox.minX + this.scrollBarSize! / 2,
          y: maxY,
        },
        thumbOffset:
          (rowHeaderScrollX * (this.cornerBBox.width - thumbSize)) / maxOffset,
        theme: this.scrollBarTheme,
        scrollTargetMaxOffset: maxOffset,
      });

      this.hRowScrollBar.addEventListener(
        ScrollType.ScrollChange,
        ({ offset }: ScrollChangeParams) => {
          const newOffset = this.getValidScrollBarOffset(offset, maxOffset);
          const newRowHeaderScrollX = floor(newOffset);

          this.setScrollOffset({ rowHeaderScrollX: newRowHeaderScrollX });

          this.rowHeader?.onRowScrollX(
            newRowHeaderScrollX,
            KEY_GROUP_ROW_RESIZE_AREA,
          );
          this.seriesNumberHeader?.onRowScrollX(
            newRowHeaderScrollX,
            KEY_GROUP_ROW_INDEX_RESIZE_AREA,
          );
          this.cornerHeader.onRowScrollX(
            newRowHeaderScrollX,
            KEY_GROUP_CORNER_RESIZE_AREA,
          );

          const scrollBarOffsetX = this.getScrollBarOffset(
            newRowHeaderScrollX,
            this.hRowScrollBar,
          );

          const { scrollX, scrollY } = this.getScrollOffset();
          const position: CellScrollPosition = {
            scrollX,
            scrollY,
            rowHeaderScrollX: scrollBarOffsetX,
          };

          this.hRowScrollBar.updateThumbOffset(scrollBarOffsetX, false);
          this.spreadsheet.emit(S2Event.ROW_CELL_SCROLL, position);
          this.spreadsheet.emit(S2Event.GLOBAL_SCROLL, position);
        },
      );
      this.foregroundGroup.appendChild(this.hRowScrollBar);
    }
  }

  getValidScrollBarOffset(offset: number, maxOffset: number) {
    return clamp(offset, 0, maxOffset);
  }

  renderHScrollBar(width: number, realWidth: number, scrollX: number) {
    if (floor(width) < floor(realWidth)) {
      const halfScrollSize = this.scrollBarSize / 2;
      const { maxY } = this.getScrollbarPosition();
      const isScrollContainsRowHeader = !this.spreadsheet.isFrozenRowHeader();
      const finalWidth =
        width +
        (isScrollContainsRowHeader
          ? Math.min(this.cornerBBox.width, this.getCanvasSize().width)
          : 0);
      const finalPosition = {
        x:
          this.panelBBox.minX +
          (isScrollContainsRowHeader
            ? -this.cornerBBox.width + halfScrollSize
            : halfScrollSize),
        y: maxY,
      };
      const finaleRealWidth =
        realWidth + (isScrollContainsRowHeader ? this.cornerBBox.width : 0);

      const { scrollBar } = this.spreadsheet.theme;
      const maxOffset = finaleRealWidth - finalWidth;
      const thumbLen = Math.max(
        (finalWidth / finaleRealWidth) * finalWidth,
        scrollBar?.thumbHorizontalMinSize!,
      );

      this.hScrollBar = new ScrollBar({
        isHorizontal: true,
        trackLen: finalWidth,
        thumbLen,
        position: finalPosition,
        thumbOffset: (scrollX * (finalWidth - thumbLen)) / maxOffset,
        theme: this.scrollBarTheme,
        scrollTargetMaxOffset: maxOffset,
      });

      this.hScrollBar.addEventListener(
        ScrollType.ScrollChange,
        ({ offset, updateThumbOffset }: ScrollChangeParams) => {
          const newScrollX = this.getValidScrollBarOffset(offset, maxOffset);

          if (updateThumbOffset) {
            this.hScrollBar.updateThumbOffset(
              this.getScrollBarOffset(newScrollX, this.hScrollBar),
              false,
            );
          }

          this.setScrollOffset({
            scrollX: newScrollX,
          });
          this.dynamicRenderCell();
        },
      );

      this.foregroundGroup.appendChild(this.hScrollBar);
    }
  }

  protected getScrollbarPosition() {
    const { maxX, maxY } = this.panelBBox;
    const { width, height } = this.getCanvasSize();
    const isContentMode =
      this.spreadsheet.options.interaction!.scrollbarPosition ===
      ScrollbarPositionType.CONTENT;

    return {
      maxX: (isContentMode ? maxX : width) - this.scrollBarSize,
      maxY: (isContentMode ? maxY : height) - this.scrollBarSize,
    };
  }

  renderVScrollBar(height: number, realHeight: number, scrollY: number) {
    if (height < realHeight) {
      const { scrollBar } = this.spreadsheet.theme;
      const thumbLen = Math.max(
        (height / realHeight) * height,
        scrollBar?.thumbVerticalMinSize!,
      );
      const maxOffset = realHeight - height;
      const { maxX } = this.getScrollbarPosition();

      this.vScrollBar = new ScrollBar({
        isHorizontal: false,
        trackLen: height,
        thumbLen,
        thumbOffset: (scrollY * (height - thumbLen)) / maxOffset,
        position: {
          x: maxX,
          y: this.panelBBox.minY,
        },
        theme: this.scrollBarTheme,
        scrollTargetMaxOffset: maxOffset,
      });

      this.vScrollBar.addEventListener(
        ScrollType.ScrollChange,
        ({ offset, updateThumbOffset }: ScrollChangeParams) => {
          const newScrollY = this.getValidScrollBarOffset(offset, maxOffset);

          if (updateThumbOffset) {
            this.vScrollBar.updateThumbOffset(
              this.getScrollBarOffset(newScrollY, this.vScrollBar),
              false,
            );
          }

          this.setScrollOffset({ scrollY: newScrollY });
          this.dynamicRenderCell();
        },
      );

      this.foregroundGroup.appendChild(this.vScrollBar);
    }
  }

  // (滑动 offset / 最大 offset（滚动对象真正长度 - 轨道长）) = (滑块 offset / 最大滑动距离（轨道长 - 滑块长）)
  getScrollBarOffset = (offset: number, scrollbar: ScrollBar) => {
    const { trackLen, thumbLen, scrollTargetMaxOffset } = scrollbar;

    return (offset * (trackLen - thumbLen)) / scrollTargetMaxOffset;
  };

  isScrollOverThePanelArea = ({ offsetX, offsetY }: CellScrollOffset) =>
    offsetX > this.panelBBox.minX &&
    offsetX < this.panelBBox.maxX &&
    offsetY > this.panelBBox.minY &&
    offsetY < this.panelBBox.maxY;

  isScrollOverTheCornerArea = ({ offsetX, offsetY }: CellScrollOffset) =>
    offsetX > this.cornerBBox.minX &&
    offsetX < this.cornerBBox.maxX &&
    offsetY > this.cornerBBox.minY &&
    offsetY < this.cornerBBox.maxY + this.panelBBox.height;

  updateHorizontalRowScrollOffset = ({
    offset,
    offsetX,
    offsetY,
  }: CellScrollOffset) => {
    // 在行头区域滚动时 才更新行头水平滚动条
    if (this.isScrollOverTheCornerArea({ offsetX, offsetY })) {
      this.hRowScrollBar?.emitScrollChange(offset!);
    }
  };

  updateHorizontalScrollOffset = ({
    offset,
    offsetX,
    offsetY,
  }: CellScrollOffset) => {
    // 1.行头没有滚动条 2.在数值区域滚动时 才更新数值区域水平滚动条
    if (
      !this.hRowScrollBar ||
      this.isScrollOverThePanelArea({ offsetX, offsetY })
    ) {
      this.hScrollBar?.emitScrollChange(offset!);
    }
  };

  isScrollToLeft = ({ deltaX, offsetX, offsetY }: CellScrollOffset) => {
    if (!this.hScrollBar && !this.hRowScrollBar) {
      return true;
    }

    const isScrollRowHeaderToLeft =
      !this.hRowScrollBar ||
      this.isScrollOverThePanelArea({ offsetY, offsetX }) ||
      this.hRowScrollBar.thumbOffset <= 0;

    const isScrollPanelToLeft =
      !this.hScrollBar || this.hScrollBar.thumbOffset <= 0;

    return deltaX! <= 0 && isScrollPanelToLeft && isScrollRowHeaderToLeft;
  };

  isScrollToRight = ({ deltaX, offsetX, offsetY }: CellScrollOffset) => {
    if (!this.hScrollBar && !this.hRowScrollBar) {
      return true;
    }

    const viewportWidth = this.spreadsheet.isFrozenRowHeader()
      ? this.panelBBox?.width
      : this.panelBBox?.maxX;

    const isScrollRowHeaderToRight =
      !this.hRowScrollBar ||
      this.isScrollOverThePanelArea({ offsetY, offsetX }) ||
      this.hRowScrollBar?.thumbOffset + this.hRowScrollBar?.thumbLen >=
        this.cornerBBox.width;

    const isScrollPanelToRight =
      (this.hRowScrollBar &&
        this.isScrollOverTheCornerArea({ offsetX, offsetY })) ||
      this.hScrollBar?.thumbOffset + this.hScrollBar?.thumbLen >= viewportWidth;

    return deltaX! >= 0 && isScrollPanelToRight && isScrollRowHeaderToRight;
  };

  isScrollToTop = (deltaY: number) => {
    if (!this.vScrollBar) {
      return true;
    }

    return deltaY <= 0 && this.vScrollBar?.thumbOffset <= 0;
  };

  isScrollToBottom = (deltaY: number) => {
    if (!this.vScrollBar) {
      return true;
    }

    return (
      deltaY >= 0 &&
      this.vScrollBar?.thumbOffset + this.vScrollBar?.thumbLen >=
        this.panelBBox?.height
    );
  };

  isVerticalScrollOverTheViewport = (deltaY: number) =>
    !this.isScrollToTop(deltaY) && !this.isScrollToBottom(deltaY);

  isHorizontalScrollOverTheViewport = (scrollOffset: CellScrollOffset) =>
    !this.isScrollToLeft(scrollOffset) && !this.isScrollToRight(scrollOffset);

  /**
   * 在当前表格滚动分两种情况:
   *  1. 当前表格无滚动条: 无需阻止外部容器滚动
   *  2. 当前表格有滚动条:
   *    - 未滚动到顶部或底部: 当前表格滚动, 阻止外部容器滚动
   *    - 滚动到顶部或底部: 恢复外部容器滚动
   */
  isScrollOverTheViewport = (scrollOffset: CellScrollOffset) => {
    const { deltaY, deltaX, offsetY } = scrollOffset;
    const isScrollOverTheHeader = offsetY <= this.cornerBBox.maxY;

    // 光标在角头或列头时, 不触发表格自身滚动
    if (isScrollOverTheHeader) {
      return false;
    }

    if (deltaY !== 0) {
      return this.isVerticalScrollOverTheViewport(deltaY!);
    }

    if (deltaX !== 0) {
      return this.isHorizontalScrollOverTheViewport(scrollOffset);
    }

    return false;
  };

  cancelScrollFrame = () => {
    if (isMobile() && this.scrollFrameId) {
      return false;
    }

    cancelAnimationFrame(this.scrollFrameId!);

    return true;
  };

  clearScrollFrameIdOnMobile = () => {
    if (isMobile()) {
      this.scrollFrameId = null;
    }
  };

  /**
   * https://developer.mozilla.org/zh-CN/docs/Web/CSS/overscroll-behavior
   * 阻止外部容器滚动: 表格是虚拟滚动, 这里按照标准模拟浏览器的 [overscroll-behavior] 实现
   * 1. auto => 只有在滚动到表格顶部或底部时才触发外部容器滚动
   * 1. contain => 默认的滚动边界行为不变（“触底”效果或者刷新），但是临近的滚动区域不会被滚动链影响到
   * 2. none => 临近滚动区域不受到滚动链影响，而且默认的滚动到边界的表现也被阻止
   * 所以只要不为 `auto`, 或者表格内, 都需要阻止外部容器滚动
   */
  protected stopScrollChainingIfNeeded = (event: WheelEvent) => {
    const { interaction } = this.spreadsheet.options;

    if (interaction?.overscrollBehavior !== 'auto') {
      this.cancelScrollFrame();
      this.stopScrollChaining(event);
    }
  };

  protected stopScrollChaining = (event: WheelEvent) => {
    if (event?.cancelable) {
      event?.preventDefault?.();
    }

    // 移动端的 prevent 存在于 originalEvent 上
    const mobileEvent = (event as unknown as GraphEvent)?.originalEvent;

    if (mobileEvent?.cancelable) {
      mobileEvent?.preventDefault?.();
    }
  };

  onWheel = (event: WheelEvent) => {
    const { interaction } = this.spreadsheet.options;
    let { deltaX, deltaY, offsetX, offsetY } = event;
    const { scrollX: currentScrollX, rowHeaderScrollX } =
      this.getScrollOffset();

    const { shiftKey } = event;

    // Windows 环境，按住 shift 时，固定为水平方向滚动，macOS 环境默认有该行为
    // see https://github.com/antvis/S2/issues/2198
    if (shiftKey && isWindows()) {
      offsetX = offsetX - deltaX + deltaY;
      deltaX = deltaY;
      offsetY -= deltaY;
      deltaY = 0;
    }

    const [optimizedDeltaX, optimizedDeltaY] = optimizeScrollXY(
      deltaX,
      deltaY,
      interaction?.scrollSpeedRatio!,
    );

    this.spreadsheet.hideTooltip();
    this.spreadsheet.interaction.clearHoverTimer();

    if (
      !this.isScrollOverTheViewport({
        deltaX: optimizedDeltaX,
        deltaY: optimizedDeltaY,
        offsetX,
        offsetY,
      })
    ) {
      this.stopScrollChainingIfNeeded(event);

      return;
    }

    this.stopScrollChaining(event);

    this.spreadsheet.interaction.addIntercepts([InterceptType.HOVER]);

    if (!this.cancelScrollFrame()) {
      return;
    }

    if (
      this.scrollDirection !== undefined &&
      this.scrollDirection !==
        (optimizedDeltaX > 0
          ? ScrollDirection.SCROLL_LEFT
          : ScrollDirection.SCROLL_RIGHT)
    ) {
      this.scrollDirection =
        optimizedDeltaX > 0
          ? ScrollDirection.SCROLL_LEFT
          : ScrollDirection.SCROLL_RIGHT;

      this.updateHorizontalRowScrollOffset({
        offsetX,
        offsetY,
        offset: rowHeaderScrollX,
      });
      this.updateHorizontalScrollOffset({
        offsetX,
        offsetY,
        offset: currentScrollX,
      });

      return;
    }

    this.scrollDirection =
      deltaX > 0 ? ScrollDirection.SCROLL_LEFT : ScrollDirection.SCROLL_RIGHT;
    this.scrollFrameId = requestAnimationFrame(() => {
      const {
        scrollX: currentScrollX,
        scrollY: currentScrollY,
        rowHeaderScrollX,
      } = this.getScrollOffset();

      if (optimizedDeltaX !== 0) {
        this.showHorizontalScrollBar();
        this.updateHorizontalRowScrollOffset({
          offsetX,
          offsetY,
          offset: optimizedDeltaX + rowHeaderScrollX,
        });
        this.updateHorizontalScrollOffset({
          offsetX,
          offsetY,
          offset: optimizedDeltaX + currentScrollX,
        });
      }

      if (optimizedDeltaY !== 0) {
        this.showVerticalScrollBar();
        this.vScrollBar?.emitScrollChange(optimizedDeltaY + currentScrollY);
      }

      this.delayHideScrollbarOnMobile();
      this.clearScrollFrameIdOnMobile();
    });
  };

  /**
   * Translate panelGroup, rowHeader, cornerHeader, columnHeader ect
   * according to new scroll offset
   * @param scrollX
   * @param scrollY
   * @param hRowScroll
   * @protected
   */
  protected translateRelatedGroups(
    scrollX: number,
    scrollY: number,
    hRowScroll: number,
  ) {
    translateGroup(
      this.panelScrollGroup,
      this.panelBBox.x - scrollX,
      this.panelBBox.y - scrollY,
    );
    this.rowHeader?.onScrollXY(
      this.getRealScrollX(scrollX, hRowScroll),
      scrollY,
      KEY_GROUP_ROW_RESIZE_AREA,
    );
    this.seriesNumberHeader?.onScrollXY(
      this.getRealScrollX(scrollX, hRowScroll),
      scrollY,
      KEY_GROUP_ROW_INDEX_RESIZE_AREA,
    );
    this.cornerHeader?.onCorScroll(
      this.getRealScrollX(scrollX, hRowScroll),
      KEY_GROUP_CORNER_RESIZE_AREA,
    );
    this.centerFrame?.onChangeShadowVisibility(
      scrollX,
      this.getRealWidth() - this.panelBBox.width,
    );
    this.centerFrame?.onBorderScroll(this.getCenterFrameScrollX(scrollX));
    this.columnHeader?.onColScroll(scrollX, KEY_GROUP_COL_RESIZE_AREA);
  }

  protected getCenterFrameScrollX(scrollX: number) {
    return this.getRealScrollX(scrollX);
  }

  public createDataCell(viewMeta: ViewMeta | null) {
    if (!viewMeta) {
      return;
    }

    const cell = this.spreadsheet.options.dataCell?.(
      viewMeta,
      this.spreadsheet,
    )!;

    if (!cell) {
      return;
    }

    const { rowIndex, colIndex } = viewMeta;

    cell.position = [rowIndex, colIndex];
    cell.name = `${rowIndex}-${colIndex}`;

    return cell;
  }

  realDataCellRender = (scrollX: number, scrollY: number) => {
    const indexes = this.calculateXYIndexes(scrollX, scrollY);

    DebuggerUtil.getInstance().logger(
      'realDataCellRender:',
      this.preCellIndexes,
      indexes,
    );
    const { add: willAddDataCells, remove: willRemoveDataCells } =
      diffPanelIndexes(this.preCellIndexes!, indexes);

    DebuggerUtil.getInstance().debugCallback(DEBUG_VIEW_RENDER, () => {
      // add new cell in panelCell
      each(willAddDataCells, ([colIndex, rowIndex]) => {
        const viewMeta = this.getCellMeta(rowIndex, colIndex);
        const cell = this.createDataCell(viewMeta);

        if (!cell) {
          return;
        }

        this.addDataCell(cell);
      });

      const allDataCells = this.getDataCells();

      // remove cell from panelCell
      each(willRemoveDataCells, ([colIndex, rowIndex]) => {
        const mountedDataCell = find(
          allDataCells,
          (cell) => cell.name === `${rowIndex}-${colIndex}`,
        );

        mountedDataCell?.remove();
      });

      DebuggerUtil.getInstance().logger(
        `Render Cell Panel: ${allDataCells?.length}, Add: ${willAddDataCells?.length}, Remove: ${willRemoveDataCells?.length}`,
      );
    });

    this.preCellIndexes = indexes;
    this.spreadsheet.emit(S2Event.LAYOUT_AFTER_REAL_DATA_CELL_RENDER, {
      add: willAddDataCells,
      remove: willRemoveDataCells,
      spreadsheet: this.spreadsheet,
    });
  };

  protected init() {
    this.initTextWrapTemp();
    this.initGroups();
    // layout
    DebuggerUtil.getInstance().debugCallback(DEBUG_HEADER_LAYOUT, () => {
      this.layoutResult = this.doLayout();
      this.saveInitColumnLeafNodes(this.layoutResult.colLeafNodes);
      this.spreadsheet.emit(
        S2Event.LAYOUT_AFTER_HEADER_LAYOUT,
        this.layoutResult,
      );
    });

    // all cell's width&height
    this.calculateCellWidthHeight();
    this.calculateRowOffsets();
    this.calculateCornerBBox();
    this.calculatePanelBBox();
    this.bindEvents();
  }

  protected renderBackground() {
    const { width, height } = this.getCanvasSize();
    const { color, opacity } = this.spreadsheet.theme.background!;

    this.backgroundGroup.appendChild(
      new Rect({
        style: {
          fill: color,
          opacity,
          x: 0,
          y: 0,
          width,
          height,
        },
      }),
    );
  }

  /**
   * Render all scrollbars, default horizontal scrollbar only control viewport
   * area(it means not contains row header)
   * 1. individual row scrollbar
   * 2. horizontal scroll bar(can control whether contains row header)
   * 3. vertical scroll bar
   */
  protected renderScrollBars() {
    const { scrollX, scrollY, rowHeaderScrollX } = this.getScrollOffset();
    const { width, height } = this.panelBBox;
    const realWidth = this.layoutResult.colsHierarchy.width;
    const realHeight = this.getRealHeight();

    // scroll row header separate from the whole canvas
    this.renderRowScrollBar(rowHeaderScrollX);

    // render horizontal scroll bar(default not contains row header)
    this.renderHScrollBar(width, realWidth, scrollX);

    // render vertical scroll bar
    this.renderVScrollBar(height, realHeight, scrollY);
  }

  /**
   * Render all headers in {@link #foregroundGroup}, contains:
   * 1. row header
   * 2. col header
   * 3. center frame
   * 4. corner header
   * 5. series number header
   */
  protected renderHeaders() {
    const seriesNumberWidth = this.getSeriesNumberWidth();

    this.rowHeader = this.getRowHeader();
    this.columnHeader = this.getColHeader();
    if (seriesNumberWidth > 0 && !this.seriesNumberHeader) {
      this.seriesNumberHeader = this.getSeriesNumberHeader();
    }

    this.cornerHeader = this.getCornerHeader();
    this.centerFrame = this.getCenterFrame();

    if (this.seriesNumberHeader) {
      this.foregroundGroup.appendChild(this.seriesNumberHeader);
    }

    if (this.rowHeader) {
      this.foregroundGroup.appendChild(this.rowHeader);
    }

    this.foregroundGroup.appendChild(this.columnHeader);
    this.foregroundGroup.appendChild(this.cornerHeader);
    this.foregroundGroup.appendChild(this.centerFrame);
  }

  protected getRowHeaderCfg(): RowHeaderConfig {
    const { y, viewportHeight, viewportWidth, height } = this.panelBBox;
    const seriesNumberWidth = this.getSeriesNumberWidth();

    return {
      width: this.cornerBBox.width,
      height,
      viewportWidth,
      viewportHeight,
      position: { x: seriesNumberWidth, y },
      nodes: this.layoutResult.rowNodes,
      spreadsheet: this.spreadsheet,
    };
  }

  protected getRowHeader(): RowHeader | null {
    if (!this.rowHeader) {
      return new RowHeader(this.getRowHeaderCfg());
    }

    return this.rowHeader;
  }

  protected getColHeader() {
    if (!this.columnHeader) {
      const { x, width, viewportHeight, viewportWidth } = this.panelBBox;

      return new ColHeader({
        width,
        cornerWidth: this.cornerBBox.width,
        height: this.cornerBBox.height,
        viewportWidth,
        viewportHeight,
        position: { x, y: 0 },
        nodes: this.layoutResult.colNodes,
        sortParam: this.spreadsheet.store.get('sortParam'),
        spreadsheet: this.spreadsheet,
      });
    }

    return this.columnHeader;
  }

  protected getCornerHeader(): CornerHeader {
    return (
      this.cornerHeader ||
      CornerHeader.getCornerHeader({
        panelBBox: this.panelBBox,
        cornerBBox: this.cornerBBox,
        seriesNumberWidth: this.getSeriesNumberWidth(),
        layoutResult: this.layoutResult,
        spreadsheet: this.spreadsheet,
      })
    );
  }

  protected getSeriesNumberHeader(): SeriesNumberHeader | null {
    return (
      this.seriesNumberHeader ||
      SeriesNumberHeader.getSeriesNumberHeader({
        spreadsheet: this.spreadsheet,
        panelBBox: this.panelBBox,
        cornerWidth: this.cornerBBox.width,
        seriesNumberWidth: this.getSeriesNumberWidth(),
        rowsHierarchy: this.layoutResult.rowsHierarchy,
      })
    );
  }

  protected getCenterFrame(): Frame {
    if (!this.centerFrame) {
      const { viewportWidth, viewportHeight } = this.panelBBox;
      const cornerWidth = this.cornerBBox.width;
      const cornerHeight = this.cornerBBox.height;
      const frame = this.spreadsheet.options?.frame;
      const frameCfg: FrameConfig = {
        position: {
          x: this.cornerBBox.x,
          y: this.cornerBBox.y,
        },
        cornerWidth,
        cornerHeight,
        viewportWidth,
        viewportHeight,
        showViewportLeftShadow: false,
        showViewportRightShadow: false,
        spreadsheet: this.spreadsheet,
      };

      return frame ? frame(frameCfg) : new Frame(frameCfg);
    }

    return this.centerFrame;
  }

  protected getGridInfo = () => {
    const [colMin, colMax, rowMin, rowMax] = this.preCellIndexes!.center;
    const cols = getColsForGrid(
      colMin!,
      colMax!,
      this.layoutResult.colLeafNodes,
    );
    const rows = getRowsForGrid(rowMin!, rowMax!, this.viewCellHeights);

    return {
      cols,
      rows,
    };
  };

  public updatePanelScrollGroup() {
    this.gridInfo = this.getGridInfo();
    this.panelScrollGroup.update(this.gridInfo);
  }

  /**
   * @param skipScrollEvent: 不触发 GLOBAL_SCROLL 事件
   */
  protected dynamicRenderCell(skipScrollEvent?: boolean) {
    const {
      scrollX,
      scrollY: originalScrollY,
      rowHeaderScrollX,
    } = this.getScrollOffset();
    const scrollY = originalScrollY + this.getPaginationScrollY();

    this.spreadsheet.hideTooltip();
    this.spreadsheet.interaction.clearHoverTimer();

    this.realDataCellRender(scrollX, scrollY);
    this.updatePanelScrollGroup();
    this.translateRelatedGroups(scrollX, scrollY, rowHeaderScrollX);
    this.clip(scrollX, scrollY);

    if (!skipScrollEvent) {
      this.emitScrollEvent({ scrollX, scrollY, rowHeaderScrollX });
    }

    this.onAfterScroll();
  }

  protected emitScrollEvent(position: CellScrollPosition) {
    this.spreadsheet.emit(S2Event.GLOBAL_SCROLL, position);
  }

  protected onAfterScroll = debounce(() => {
    const { interaction, container } = this.spreadsheet;

    // 如果是选中单元格状态, 则继续保留 hover 拦截, 避免滚动后 hover 清空已选单元格
    if (!interaction.isSelectedState()) {
      interaction.removeIntercepts([InterceptType.HOVER]);

      if (interaction.getHoverAfterScroll()) {
        // https://github.com/antvis/S2/issues/2222
        const canvasMousemoveEvent =
          interaction.eventController.canvasMousemoveEvent;

        if (canvasMousemoveEvent) {
          const { x, y } = canvasMousemoveEvent;
          const shape = container.document.elementFromPointSync(x, y);

          if (shape) {
            container.emit(OriginEventType.POINTER_MOVE, {
              ...canvasMousemoveEvent,
              shape,
              target: shape,
              timestamp: performance.now(),
            });
          }
        }
      }
    }
  }, 300);

  protected saveInitColumnLeafNodes(columnNodes: Node[] = []) {
    const { store, options } = this.spreadsheet;
    const { hiddenColumnFields = [] } = options.interaction!;

    // 当前显示的 + 被隐藏的
    const originalColumnsLength =
      columnNodes.length + hiddenColumnFields.length;
    const initColLeafNodes = this.getInitColLeafNodes();

    if (originalColumnsLength !== initColLeafNodes?.length) {
      store.set('initColLeafNodes', columnNodes);
    }
  }

  public getHiddenColumnsInfo(columnNode: Node): HiddenColumnsInfo | undefined {
    const hiddenColumnsDetail = this.spreadsheet.store.get(
      'hiddenColumnsDetail',
      [],
    );

    if (isEmpty(hiddenColumnsDetail)) {
      return;
    }

    return hiddenColumnsDetail.find((detail) =>
      detail?.hideColumnNodes?.some((node) => node.id === columnNode.id),
    );
  }

  public updateCustomFieldsSampleNodes(colsHierarchy: Hierarchy) {
    if (!this.spreadsheet.isCustomColumnFields()) {
      return;
    }

    // 每一列层级不定, 用层级最深的那一列采样高度
    const nodes = colsHierarchy.getNodes().filter((node) => {
      return colsHierarchy.sampleNodeForLastLevel?.id.includes(node.id);
    });

    colsHierarchy.sampleNodesForAllLevels = nodes;
    colsHierarchy.height = sumBy(nodes, 'height');
  }

  /**
   * @description 自定义行头时, 叶子节点层级不定, 需要自动对齐其宽度, 填充空白
   * -------------------------------------------------
   * |  自定义节点 a-1  |  自定义节点 a-1-1              |
   * |-------------   |-------------     |------------|
   * |  自定义节点 b-1  |  自定义节点 b-1-1 |  指标 1    |
   * -------------------------------------------------
   */
  public adjustCustomRowLeafNodesWidth(params: AdjustLeafNodesParams) {
    if (!this.spreadsheet.isCustomRowFields()) {
      return;
    }

    this.adjustLeafNodesSize('width')(params);
  }

  /**
   * @description 自定义列头时, 叶子节点层级不定, 需要自动对齐其高度, 填充空白
   * ------------------------------------------------------------------------
   * |                       自定义节点 a-1                                   |
   * |----------------------------------------------------------------------|
   * |                 自定义节点 a-1-1               |                       |
   * |-------------|-------------|------------------|   自定义节点 a-1-2      |
   * |   指标 1    |  自定义节点 a-1-1-1    | 指标 2  |                        |
   * ----------------------------------------------------------------------
   */
  public adjustCustomColLeafNodesHeight(params: AdjustLeafNodesParams) {
    if (!this.spreadsheet.isCustomColumnFields()) {
      return;
    }

    this.adjustLeafNodesSize('height')(params);
  }

  public adjustLeafNodesSize(type: 'width' | 'height') {
    return ({ leafNodes, hierarchy }: AdjustLeafNodesParams) => {
      const { sampleNodeForLastLevel, sampleNodesForAllLevels } = hierarchy;

      leafNodes.forEach((node) => {
        if (node.level > sampleNodeForLastLevel?.level!) {
          return;
        }

        const leafNodeSize = sumBy(sampleNodesForAllLevels, (sampleNode) => {
          if (sampleNode.level < node.level) {
            return 0;
          }

          return sampleNode[type];
        });

        node[type] = leafNodeSize;
      });
    };
  }

  /**
   * 获取表头节点 (角头,序号,行头,列头) (含可视区域)
   * @example 获取全部: facet.getHeaderNodes()
   * @example 获取一组 facet.getHeaderNodes(['root[&]浙江省[&]宁波市', 'root[&]浙江省[&]杭州市'])
   */
  public getHeaderNodes(nodeIds?: string[]): Node[] {
    const headerNodes = concat<Node>(
      this.getCornerNodes(),
      this.getSeriesNumberNodes(),
      this.getRowNodes(),
      this.getColNodes(),
    );

    if (!nodeIds) {
      return headerNodes;
    }

    return headerNodes.filter((node) => nodeIds.includes(node.id));
  }

  /**
   * 获取角头节点
   */
  public getCornerNodes(): Node[] {
    return this.cornerHeader?.getNodes() || [];
  }

  /**
   * 获取序号节点
   */
  public getSeriesNumberNodes(): Node[] {
    return this.seriesNumberHeader?.getNodes() || [];
  }

  /**
   * 获取列头节点 (含非可视区域)
   * @description 获取列头单元格 (可视区域内) facet.getColCells()
   * @example 获取全部: facet.getColNodes()
   * @example 指定层级: facet.getColNodes(level)
   */
  public getColNodes(level?: number): Node[] {
    const { colNodes = [] } = this.layoutResult;

    if (isNil(level)) {
      return colNodes;
    }

    return colNodes.filter((node) => node.level === level);
  }

  public getTopLevelColNodes() {
    return this.getColNodes(0);
  }

  /**
   * 根据 id 获取指定列头节点
   * @example facet.getColNodeById('root[&]节点1[&]数值')
   */
  public getColNodeById(nodeId: string): Node | undefined {
    return this.getColNodes().find((node) => node.id === nodeId);
  }

  /**
   * 根据列头索引获取指定列头节点
   * @example facet.getColNodeByIndex(colIndex)
   */
  public getColNodeByIndex(colIndex: number): Node | undefined {
    return this.getColNodes().find((node) => node.colIndex === colIndex);
  }

  /**
   * 获取在索引范围内的列头叶子节点
   * @example facet.getColLeafNodesByRange(0,10) 获取索引范围在 0（包括 0） 到 10（包括 10）的列头叶子节点
   */
  public getColLeafNodesByRange(minIndex: number, maxIndex: number) {
    return this.getColLeafNodes().filter(
      (node) => node.colIndex >= minIndex && node.colIndex <= maxIndex,
    );
  }

  /**
   * 根据列头索引获取指定列头叶子节点
   * @example facet.getColLeafNodes(colIndex)
   */
  public getColLeafNodeByIndex(colIndex: number): Node | undefined {
    return this.getColLeafNodes().find((node) => node.colIndex === colIndex);
  }

  /**
   * 根据 field 获取指定列头节点
   * @example facet.getColCellNodeByField('number')
   */
  public getColNodesByField(nodeField: string): Node[] {
    return this.getColNodes().filter((node) => node.field === nodeField);
  }

  /**
   * 获取列头叶子节点节点 (含非可视区域)
   */
  public getColLeafNodes(): Node[] {
    return this.layoutResult?.colLeafNodes || [];
  }

  /**
   * 获取列头小计/总计节点 (含非可视区域)
   * @example 获取全部: facet.getColTotalsNodes()
   * @example 指定层级: facet.getColTotalsNodes(level)
   */
  public getColTotalsNodes(level?: number): Node[] {
    return this.getColNodes(level).filter((node) => node.isTotals);
  }

  /**
   * 获取列头小计节点 (含非可视区域)
   * @example 获取全部: facet.getColSubTotalsNodes()
   * @example 指定层级: facet.getColSubTotalsNodes(level)
   */
  public getColSubTotalsNodes(level?: number): Node[] {
    return this.getColTotalsNodes(level).filter((node) => node.isSubTotals);
  }

  /**
   * 获取列头总计节点 (含非可视区域)
   * @example 获取全部: facet.getColGrandTotalsNodes()
   * @example 指定层级: facet.getColGrandTotalsNodes(level)
   */
  public getColGrandTotalsNodes(level?: number): Node[] {
    return this.getColTotalsNodes(level).filter((node) => node.isGrandTotals);
  }

  /**
   * 获取行头节点 (含非可视区域)
   * @description 获取行头单元格 (可视区域内) facet.getRowCells()
   * @example 获取全部: facet.getRowNodes()
   * @example 指定层级: facet.getRowNodes(level)
   */
  public getRowNodes(level?: number): Node[] {
    const { rowNodes = [] } = this.layoutResult;

    if (isNil(level)) {
      return rowNodes;
    }

    return rowNodes.filter((node) => node.level === level);
  }

  /**
   * 根据 id 获取单个行头节点
   * @example facet.getRowNodeById('root[&]节点1[&]数值')
   */
  public getRowNodeById(nodeId: string): Node | undefined {
    return this.getRowNodes().find((node) => node.id === nodeId);
  }

  /**
   * 根据行头索引获取指定列头节点
   * @example facet.getRowNodeByIndex(rowIndex)
   */
  public getRowNodeByIndex(rowIndex: number): Node | undefined {
    return this.getRowNodes().find((node) => node.rowIndex === rowIndex);
  }

  /**
   * 根据行头索引获取指定列头叶子节点
   * @example facet.getRowLeafNodeByIndex(rowIndex)
   */
  public getRowLeafNodeByIndex(rowIndex: number): Node | undefined {
    return this.getRowLeafNodes().find((node) => node.rowIndex === rowIndex);
  }

  /**
   * 获取在索引范围内的行头叶子节点
   * @example facet.getRowLeafNodesByRange(0,10) 获取索引范围在 0（包括 0） 到 10（包括 10）的行头叶子节点
   */
  public getRowLeafNodesByRange(minIndex: number, maxIndex: number) {
    return this.getRowLeafNodes().filter(
      (node) => node.rowIndex >= minIndex && node.rowIndex <= maxIndex,
    );
  }

  /**
   * 根据 field 获取行头节点
   * @example facet.getRowNodeByField('number')
   */
  public getRowNodesByField(nodeField: string): Node[] {
    return this.getRowNodes().filter((node) => node.field === nodeField);
  }

  /**
   * 获取行头叶子节点节点 (含非可视区域)
   * @example 获取全部: facet.getRowLeafNodes()
   */
  public getRowLeafNodes(): Node[] {
    return this.layoutResult?.rowLeafNodes || [];
  }

  /**
   * 获取行头小计/总计节点 (含非可视区域)
   * @example 获取全部: facet.getRowTotalsNodes()
   * @example 指定层级: facet.getRowTotalsNodes(level)
   */
  public getRowTotalsNodes(level?: number): Node[] {
    return this.getRowNodes(level).filter((node) => node.isTotals);
  }

  /**
   * 获取行头小计节点 (含非可视区域)
   * @example 获取全部: facet.getRowSubTotalsNodes()
   * @example 指定层级: facet.getRowSubTotalsNodes(level)
   */
  public getRowSubTotalsNodes(level?: number): Node[] {
    return this.getRowTotalsNodes(level).filter((node) => node.isSubTotals);
  }

  /**
   * 获取行头总计节点 (含非可视区域)
   * @example 获取全部: facet.getRowGrandTotalsNodes()
   * @example 指定层级: facet.getRowGrandTotalsNodes(level)
   */
  public getRowGrandTotalsNodes(level?: number): Node[] {
    return this.getRowTotalsNodes(level).filter((node) => node.isGrandTotals);
  }

  /**
   * 获取单元格的所有子节点 (含非可视区域)
   * @example
   * const rowCell = facet.getRowCells()[0]
   * facet.getCellChildrenNodes(rowCell)
   */
  public getCellChildrenNodes = (cell: S2CellType): Node[] => {
    const selectNode = cell?.getMeta?.() as Node;
    const isRowCell = cell?.cellType === CellType.ROW_CELL;
    const isHierarchyTree = this.spreadsheet.isHierarchyTreeType();

    // 树状模式的行头点击不需要遍历当前行头的所有子节点，因为只会有一级
    if (isHierarchyTree && isRowCell) {
      return Node.getAllLeaveNodes(selectNode).filter(
        (node) => node.rowIndex === selectNode.rowIndex,
      );
    }

    // 平铺模式 或 树状模式的列头点击遍历所有子节点
    return Node.getAllChildrenNodes(selectNode);
  };

  /**
   * 获取数值单元格 (不含可视区域)
   * @description 由于虚拟滚动, 按需加载的特性, 非可视区域的单元格未被实例化
   * @example 获取非可视区域的数值节点 facet.getCellMeta(rowIndex, colIndex)
   */
  public getDataCells(): DataCell[] {
    return getAllChildCells(this.panelGroup?.children as DataCell[], DataCell);
  }

  /**
   * 获取行头单元格 (不含可视区域)
   */
  public getRowCells(): RowCell[] {
    const headerChildren = (this.getRowHeader()?.children || []) as RowCell[];

    return getAllChildCells(headerChildren, RowCell).filter(
      (cell: S2CellType) => cell.cellType === CellType.ROW_CELL,
    );
  }

  /**
   * 获取行头叶子节点单元格 (不含可视区域)
   */
  public getRowLeafCells(): RowCell[] {
    return this.getRowCells().filter((cell) => cell.getMeta().isLeaf);
  }

  /**
   * 获取列头单元格 (不含可视区域)
   */
  public getColCells(): ColCell[] {
    const headerChildren = (this.getColHeader()?.children || []) as ColCell[];

    return getAllChildCells(headerChildren, ColCell).filter(
      (cell: S2CellType) => cell.cellType === CellType.COL_CELL,
    );
  }

  /**
   * 获取列头叶子节点单元格 (不含可视区域)
   */
  public getColLeafCells(): ColCell[] {
    return this.getColCells().filter((cell) => cell.getMeta().isLeaf);
  }

  /**
   * 获取合并单元格 (不含可视区域)
   */
  public getMergedCells(): MergedCell[] {
    return filter(
      this.panelScrollGroup.getMergedCellsGroup().children,
      (element: MergedCell) => element instanceof MergedCell,
    ) as unknown[] as MergedCell[];
  }

  /**
   * 获取角头单元格 (不含可视区域)
   */
  public getCornerCells(): CornerCell[] {
    const headerChildren = (this.getCornerHeader()?.children ||
      []) as CornerCell[];

    return getAllChildCells(headerChildren, CornerCell).filter(
      (cell: S2CellType) => cell.cellType === CellType.CORNER_CELL,
    );
  }

  protected filterCells(
    cells: S2CellType[],
    filterIds?: string[] | SelectedIds,
  ) {
    if (isEmpty(filterIds)) {
      return cells;
    }

    if (isArray(filterIds)) {
      return cells.filter((cell) => {
        return includes(filterIds, cell.getMeta().id);
      });
    }

    return cells.filter((cell) => {
      const ids = filterIds[cell.cellType];

      if (!ids) {
        return false;
      }

      return ids.includes(cell.getMeta().id);
    });
  }

  /**
   * 获取序号单元格 (不含可视区域)
   */
  public abstract getSeriesNumberCells():
    | SeriesNumberCell[]
    | TableSeriesNumberCell[];

  /**
   * 获取表头单元格 (序号,角头,行头,列头) (不含可视区域)
   * @example 获取全部: facet.getHeaderCells()
   * @example 获取一组 facet.getHeaderCells(['root[&]浙江省[&]宁波市', 'root[&]浙江省[&]杭州市'])
   */
  public getHeaderCells(
    cellIds?: string[] | SelectedIds,
  ): S2CellType<ViewMeta>[] {
    const headerCells = concat<S2CellType>(
      this.getCornerCells(),
      this.getSeriesNumberCells(),
      this.getRowCells(),
      this.getColCells(),
    );

    return this.filterCells(headerCells, cellIds);
  }

  /**
   * 根据单元格 id 获取指定单元格 (不含可视区域)
   * @example facet.getCellById('root[&]浙江省[&]宁波市')
   */
  public getCellById(cellId: string): S2CellType<ViewMeta> | undefined {
    return this.getCells().find((cell) => cell.getMeta().id === cellId);
  }

  /**
   * 根据单元格 field 获取指定单元格 (不含可视区域)
   * @example facet.getCellByField('city')
   */
  public getCellsByField(cellField: string): S2CellType<ViewMeta>[] {
    return this.getCells().filter((cell) => cell.getMeta().field === cellField);
  }

  /**
   * 获取所有单元格 (角头,行头,列头,数值) (不含可视区域)
   * @example 获取全部: facet.getCells()
   * @example 获取一组 facet.getCells(['root[&]浙江省[&]宁波市', 'root[&]浙江省[&]杭州市'])
   */
  public getCells(cellIds?: string[]): S2CellType<ViewMeta>[] {
    const cells = concat<S2CellType>(
      this.getHeaderCells(),
      this.getDataCells(),
    );

    if (!cellIds) {
      return cells;
    }

    return cells.filter((cell) => cellIds.includes(cell.getMeta().id));
  }

  public getInitColLeafNodes(): Node[] {
    return this.spreadsheet.store.get('initColLeafNodes', [])!;
  }

  public clearInitColLeafNodes() {
    this.spreadsheet.store.set('initColLeafNodes', undefined);
  }

  /**
   * @tip 和 this.spreadsheet.measureTextWidth() 的区别在于:
   * 1. 额外添加一像素余量，防止 maxLabel 有多个同样长度情况下，一些 label 不能展示完全, 出现省略号
   * 2. 测量时, 文本宽度取整, 避免子像素的不一致性
   */
  protected measureTextWidth(text: SimpleData, font: unknown): number {
    const EXTRA_PIXEL = 1;

    return (
      Math.ceil(this.spreadsheet.measureTextWidth(text, font)) + EXTRA_PIXEL
    );
  }
}
