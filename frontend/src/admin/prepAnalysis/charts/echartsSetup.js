// Registers only the ECharts pieces Prep Analysis draws, so the bundle stays small.
import * as echarts from "echarts/core";
import { BarChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart } from "echarts/charts";
import {
  AriaComponent, CalendarComponent, GridComponent, LegendComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart,
  AriaComponent, CalendarComponent, GridComponent, LegendComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  CanvasRenderer,
]);

export default echarts;
