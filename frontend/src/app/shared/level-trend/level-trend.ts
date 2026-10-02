import { Component, computed, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { TankHistory } from '../../core/models/tank.models';

const fmtDateTime = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtLiters = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

/** Trend del livello in litri con le linee di soglia. */
@Component({
  selector: 'app-level-trend',
  imports: [NgxEchartsDirective],
  template: `<div echarts class="chart" [options]="options()" [loading]="loading()" [autoResize]="true"></div>`,
  styles: `
    .chart {
      width: 100%;
      height: 380px;
    }
  `,
})
export class LevelTrend {
  readonly history = input<TankHistory | null>(null);
  readonly loading = input(false);

  protected readonly options = computed<EChartsCoreOption>(() => {
    const h = this.history();
    const data = (h?.samples ?? []).map((s) => [Date.parse(s.timestamp), s.levelLiters]);
    const th = h?.thresholds;
    const thresholdLines = th
      ? [
          { yAxis: th.tooFullLiters, name: 'Troppo pieno', lineStyle: { color: '#c4161c', type: 'solid' } },
          { yAxis: th.fillLiters, name: 'Pieno', lineStyle: { color: '#e0600b', type: 'solid' } },
          { yAxis: th.lowWarningLiters, name: 'Liv. basso', lineStyle: { color: '#b07f00', type: 'dashed' } },
          { yAxis: th.lowStopLiters, name: 'Liv. minimo', lineStyle: { color: '#c4161c', type: 'dashed' } },
        ].filter((l) => l.yAxis !== null)
      : [];

    return {
      animation: false,
      textStyle: { fontFamily: 'Segoe UI, Roboto, Arial, sans-serif' },
      grid: { left: 56, right: 100, top: 16, bottom: 64 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = (params as { value: [number, number | null] }[])[0];
          if (!p) return '';
          const [t, v] = p.value;
          const pct = h && v !== null ? ` (${((v / h.capacityLiters) * 100).toFixed(1).replace('.', ',')} %)` : '';
          return `${fmtDateTime.format(t)}<br><b>${v === null ? 'misura non valida' : fmtLiters.format(v) + ' l' + pct}</b>`;
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          hideOverlap: true,
          color: '#5b5b57',
          formatter: { year: '{yyyy}', month: '{MM}/{yyyy}', day: '{dd}/{MM}', hour: '{HH}:{mm}', minute: '{HH}:{mm}' },
        },
        axisLine: { lineStyle: { color: '#a9a9a4' } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: h?.capacityLiters,
        name: 'litri',
        nameTextStyle: { color: '#5b5b57' },
        axisLabel: { color: '#5b5b57', formatter: (v: number) => fmtLiters.format(v) },
        splitLine: { lineStyle: { color: '#d4d4d0' } },
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        {
          type: 'slider',
          height: 20,
          bottom: 12,
          filterMode: 'none',
          labelFormatter: '',
          borderColor: '#a9a9a4',
          fillerColor: 'rgba(58, 74, 87, 0.15)',
          handleStyle: { color: '#ececea', borderColor: '#5b5b57' },
          moveHandleStyle: { color: '#a9a9a4' },
          dataBackground: { lineStyle: { color: '#8a8a85' }, areaStyle: { color: '#d4d4d0' } },
          selectedDataBackground: { lineStyle: { color: '#3a4a57' }, areaStyle: { color: 'rgba(111, 127, 140, 0.3)' } },
        },
      ],
      series: [
        {
          type: 'line',
          name: 'Livello',
          data,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 1.5, color: '#3a4a57' },
          itemStyle: { color: '#3a4a57' },
          areaStyle: { color: 'rgba(111, 127, 140, 0.18)' },
          markLine: {
            symbol: 'none',
            silent: true,
            label: { position: 'end', formatter: '{b}', color: '#1d1d1b', fontSize: 11 },
            data: thresholdLines,
          },
        },
      ],
    };
  });
}
