// Registers only the ECharts pieces Prep Analysis draws, so the bundle stays small.
import * as echarts from "echarts/core";
import { BarChart, BoxplotChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, TreemapChart } from "echarts/charts";
import {
  AriaComponent, CalendarComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, PolarComponent,
  RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart, BoxplotChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, TreemapChart,
  AriaComponent, CalendarComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, PolarComponent,
  RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  CanvasRenderer,
]);

export default echarts;
