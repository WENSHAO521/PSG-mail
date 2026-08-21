<template>
  <div v-if="analysisLoading" class="analysis-loading">
    <loading/>
  </div>
  <div v-else class="page-outer" :key="boxKey">

    <!-- ── Stat cards ── -->
    <div class="stat-grid">
      <section class="stat-card">
        <div class="stat-body">
          <div class="stat-left">
            <div class="stat-label">{{ $t('totalReceived') }}</div>
            <div class="stat-value">
              <el-statistic :formatter="value => Math.round(value)" :value="receiveData"/>
            </div>
          </div>
          <div class="stat-icon" style="background:rgba(14,165,233,0.1);color:rgb(14,165,233)">
            <Icon icon="psg:inbox" width="24" height="24"/>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalReceiveTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delReceiveTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>
      <section class="stat-card">
        <div class="stat-body">
          <div class="stat-left">
            <div class="stat-label">{{ $t('totalSent') }}</div>
            <div class="stat-value">
              <el-statistic :formatter="value => Math.round(value)" :value="sendData"/>
            </div>
          </div>
          <div class="stat-icon" style="background:rgba(99,102,241,0.1);color:rgb(99,102,241)">
            <Icon icon="psg:send" width="24" height="24"/>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalSendTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delSendTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>
      <section class="stat-card">
        <div class="stat-body">
          <div class="stat-left">
            <div class="stat-label">{{ $t('totalMailboxes') }}</div>
            <div class="stat-value">
              <el-statistic :formatter="value => Math.round(value)" :value="accountData"/>
            </div>
          </div>
          <div class="stat-icon" style="background:rgba(16,185,129,0.1);color:rgb(16,185,129)">
            <Icon icon="psg:all-mail" width="24" height="24"/>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalAccountTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delAccountTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>
      <section class="stat-card">
        <div class="stat-body">
          <div class="stat-left">
            <div class="stat-label">{{ $t('totalUsers') }}</div>
            <div class="stat-value">
              <el-statistic :formatter="value => Math.round(value)" :value="userData"/>
            </div>
          </div>
          <div class="stat-icon" style="background:rgba(245,158,11,0.1);color:rgb(245,158,11)">
            <Icon icon="psg:group" width="24" height="24"/>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalUserTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delUserTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>
    </div>

    <!-- ── Charts row 1 ── -->
    <div class="chart-grid">
      <section class="chart-card">
        <h2 class="chart-title">{{ $t('emailSource') }}</h2>
        <div class="sender-pie chart-area"></div>
      </section>
      <section class="chart-card">
        <h2 class="chart-title">{{ $t('userGrowth') }}</h2>
        <div class="increase-line chart-area"></div>
      </section>
    </div>

    <!-- ── Charts row 2 ── -->
    <div class="chart-grid">
      <section class="chart-card">
        <h2 class="chart-title">{{ $t('emailGrowth') }}</h2>
        <div class="email-column chart-area"></div>
      </section>
      <section class="chart-card">
        <h2 class="chart-title">{{ $t('sentToday') }}</h2>
        <div class="send-count chart-area"></div>
      </section>
    </div>

  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {useTransition} from "@vueuse/core";
import {defineOptions, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, watch, computed} from "vue";
import echarts from "@/echarts/index.js";
import dayjs from "dayjs";
import {analysisEcharts} from "@/request/analysis.js";
import {useUiStore} from "@/store/ui.js";
import {debounce} from "lodash-es";
import loading from "@/components/loading/index.vue";
import {useRoute} from "vue-router";
import {useI18n} from 'vue-i18n';

defineOptions({
  name: 'analysis'
})

const {t} = useI18n();
const route = useRoute();
const uiStore = useUiStore()
const checkedSourceType = ref('sender')
const receiveTotal = ref(0)
const sendTotal = ref(0)
const accountTotal = ref(0)
const userTotal = ref(0)
const analysisLoading = ref(true)

const numberCount = reactive({
  normalReceiveTotal: 0,
  normalSendTotal: 0,
  normalAccountTotal: 0,
  normalUserTotal: 0,
  delReceiveTotal: 0,
  delSendTotal: 0,
  delAccountTotal: 0,
  delUserTotal: 0
})


const receiveData = useTransition(receiveTotal, {
  duration: 1500,
})

const sendData = useTransition(sendTotal, {
  duration: 1500,
})

const accountData = useTransition(accountTotal, {
  duration: 1500,
})

const userData = useTransition(userTotal, {
  duration: 1500,
})

const senderData = ref(null)
const userLineData = reactive({
  xdata: [],
  sdata: []
})

const emailColumnData = {
  receiveData: [],
  sendData: [],
  daysData: []
}

const topic = computed(() => ({
  color: uiStore.dark ? '#E5EAF3' : '#303133',
  background: uiStore.dark ? '#141414' : '#FFFFFF',
  borderColor: uiStore.dark ? '#141414' : '#FFFFFF',
  scaleLineColor: uiStore.dark ? '#636466' : '#CDD0D6',
  crossColor: uiStore.dark ? '#8D9095' : '#A8ABB2',
  axisColor: uiStore.dark ? '#A3A6AD' : '#909399',
  splitLineColor: uiStore.dark ? '#58585B' : '#D4D7DE',
  gaugeSplitLine: uiStore.dark ? '#CFD3DC' : '#606266',
  containerBackground: uiStore.dark ? '#282828' : '#ECECEA',
  // Ink accent for echarts (canvas-rendered — cannot resolve CSS var(),
  // so mirror tokens.css's --psg-primary light/dark values here directly)
  accent: uiStore.dark ? '#F2F2EE' : '#111111',
  accentRgb: uiStore.dark ? '242, 242, 238' : '17, 17, 17',
  // Secondary series color — grayscale only, per the admin chart spec
  // (no decorative hues; red is reserved for warning/critical series)
  accentSecondary: uiStore.dark ? '#8A8A85' : '#A3A3A3',
  categoryPalette: uiStore.dark
    ? ['#F2F2EE', '#C7C7C2', '#9C9C97', '#727270', '#4D4D4B', '#2E2E2C']
    : ['#111111', '#3D3D3D', '#666666', '#8C8C8C', '#B3B3B3', '#D9D9D9'],
}))
let daySendTotal = 0
let leaveWidth = 0
let senderPie = null
let increaseLine = null
let emailColumn = null
let sendGauge = null
let first = true
let boxKey = ref(0)
let senderPieLeft = window.innerWidth < 500 ? `${window.innerWidth - 110}` : '72%'
let analysisDark = uiStore.dark

onMounted(() => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  analysisEcharts(timeZone).then(data => {
    receiveTotal.value = data.numberCount.receiveTotal
    sendTotal.value = data.numberCount.sendTotal
    accountTotal.value = data.numberCount.accountTotal
    userTotal.value = data.numberCount.userTotal
    numberCount.normalReceiveTotal = data.numberCount.normalReceiveTotal
    numberCount.normalSendTotal = data.numberCount.normalSendTotal
    numberCount.normalAccountTotal = data.numberCount.normalAccountTotal
    numberCount.normalUserTotal = data.numberCount.normalUserTotal
    numberCount.delReceiveTotal = data.numberCount.delReceiveTotal
    numberCount.delSendTotal = data.numberCount.delSendTotal
    numberCount.delAccountTotal = data.numberCount.delAccountTotal
    numberCount.delUserTotal = data.numberCount.delUserTotal
    senderData.value = data.receiveRatio.nameRatio.map(item => {
      return {
        name: item.name || ' ',
        value: item.total
      }
    })

    userLineData.xdata = data.userDayCount.map(item => dayjs(item.date).format("M.D"));
    userLineData.sdata = data.userDayCount.map(item => item.total)

    emailColumnData.daysData = data.emailDayCount.receiveDayCount.map(item => dayjs(item.date).format("M.D"))
    emailColumnData.receiveData = data.emailDayCount.receiveDayCount.map(item => item.total)
    emailColumnData.sendData = data.emailDayCount.sendDayCount.map(item => item.total)
    daySendTotal = data.daySendTotal
    initPicture();
    first = false
  }).finally(() => {
    analysisLoading.value = false
  })

})

const widthChange = debounce(initPicture, 500, {
  leading: false,
  trailing: true
})


watch(() => uiStore.asideShow, () => {
  if (window.innerWidth > 1024) {
    widthChange()
  }
})

onActivated(() => {
  if (first) return
  if (window.innerWidth !== leaveWidth && leaveWidth !== 0) {
    widthChange()
  } else if (!senderPie) {
    widthChange()
  } else if (analysisDark !== uiStore.dark) {
    initPicture()
    analysisDark = uiStore.dark
  }
})

onDeactivated(() => {
  leaveWidth = window.innerWidth
})

const onResize = () => { setStyle(); widthChange() }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

watch(() => uiStore.dark, () => {
  if (route.name !== 'analysis') return
  analysisDark = uiStore.dark
  initPicture()
})

function initPicture() {
  if (route.name !== 'analysis') return
  boxKey.value++
  setTimeout(() => {
    createSenderPie()
    createIncreaseLine()
    createEmailColumnChart();
    createSendGauge();
  })
}

function setStyle() {
  senderPieLeft = window.innerWidth < 500 ? `${window.innerWidth - 110}` : '72%'
  emailColumnData.barWidth = window.innerWidth > 767 ? '40%' : '60%'
}

const measureCtx = document.createElement('canvas').getContext('2d');
measureCtx.font = '12px sans-serif';

function truncateTextByWidth(text, maxWidth = 140) {

  let width = measureCtx.measureText(text).width;
  if (width <= maxWidth) return text;

  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += text[i];
    if (measureCtx.measureText(result + '…').width > maxWidth) {
      return result.slice(0, -1) + '…';
    }
  }
  return text;
}

function createSenderPie() {

  if (senderPie) {
    senderPie.dispose()
  }
  senderPie = echarts.init(document.querySelector(".sender-pie"))
  let option = {
    tooltip: {
      trigger: 'item',
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background,
      formatter: params => {
        return `${params.marker} ${params.name}： ${params.value} (${params.percent}%)`;
      }
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      left: '10',
      top: '20',
      textStyle: {
        color: topic.value.color
      },
      formatter: function (name) {
        return truncateTextByWidth(name)
      }
    },
    series: [
      {
        data: senderData.value,
        name: '',
        type: 'pie',
        radius: ['40%', '65%'],
        center: [senderPieLeft, '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: topic.value.borderColor,
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'outside', // 标签显示在外部
          formatter: '{d}%',  // 显示名称和占比
          color: topic.value.color,
          fontSize: 14  // 设置字体大小
        },
        emphasis: {
          label: {
            show: false,
            fontSize: 40,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: true
        },
        color: topic.value.categoryPalette
      }
    ]
  }
  senderPie.setOption(option)
}

function createIncreaseLine() {

  if (increaseLine) {
    increaseLine.dispose()
  }

  increaseLine = echarts.init(document.querySelector(".increase-line"))

  let option = {
    tooltip: {
      trigger: 'axis', // 设置触发方式为 'axis'，在坐标轴上显示信息
      axisPointer: {
        type: 'cross', // 指示器的类型为交叉型，适用于折线图等
        crossStyle: {
          color: topic.value.crossColor// 设置指示器线的颜色
        },
        lineStyle: {
          color: topic.value.crossColor         // ← 竖线颜色
        },
        axis: 'x',
      },
      formatter: function (params) {
        let result = ''
        params.forEach(item => {
          result = `${item.marker} ${t('growthTotalUsers')} ${item.value}`;
        });
        return result;
      },
      backgroundColor: topic.value.background,  // 设置背景颜色
      borderColor: topic.value.splitLineColor,      // 设置边框颜色
      borderWidth: 1,           // 设置边框宽度
      padding: 10,              // 设置内边距
      textStyle: {
        color: topic.value.color,          // 设置文字颜色
      }
    },
    grid: {
      top: '8%',
      right: '20',
      left: '35',
      bottom: '35'
    },
    xAxis: {
      type: 'category',
      data: userLineData.xdata,
      axisTick: {
        show: false,
        alignWithLabel: false,  // 刻度线与标签对齐,
        lineStyle: {
          color: topic.value.axisColor,
        }
      },
      axisPointer: {
        label: {
          show: false
        }
      },
      axisLine: {
        lineStyle: {
          color: topic.value.axisColor,
          width: 1,
          type: 'solid'
        }
      },
      axisLabel: {
        formatter: function (value, index) {
          if (index === 0) {
            return '      ' + value;
          }
          if (index === userLineData.xdata.length - 1) {
            return value + '   '
          }
          return value;
        },

      },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        margin: 5, // 增加y轴刻度数字与网格线之间的间距
      },
      boundaryGap: [0, 0.1],
      max: (params) => {
        if (params.max < 8) {
          return 10
        }
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: topic.value.axisColor,
          width: 1,
        }
      },
      axisPointer: {
        label: {
          show: true,
          formatter: (e) => {
            return Math.round(e.value)
          }
        }
      },
      splitLine: {
        show: true, // 显示网格线
        lineStyle: {
          type: 'dashed', // 设置网格线为虚线
          color: topic.value.scaleLineColor   // 设置虚线的颜色
        }
      }
    },
    series: [
      {

        data: userLineData.sdata,
        type: 'line',
        smooth: 0.1,
        symbol: 'none',
        lineStyle: {
          color: topic.value.accent,
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: `rgba(${topic.value.accentRgb}, 0.18)`
            },
            {
              offset: 1,
              color: `rgba(${topic.value.accentRgb}, 0.02)`
            }
          ])
        },
        color: [topic.value.accent],
      }
    ]
  };
  increaseLine.setOption(option);

  let max = increaseLine.getModel().getComponent('yAxis', 0).axis.scale.getExtent()[1];

  let left = 35

  if (max > 99) left = 42
  if (max > 999) left = 51
  if (max > 9999) left = 58
  if (max > 99999) left = 66

  increaseLine.setOption({
    grid: {
      left: left
    }
  });
}

function createEmailColumnChart() {

  if (emailColumn) {
    emailColumn.dispose()
  }

  emailColumn = echarts.init(document.querySelector(".email-column"));

  const option = {
    tooltip: {
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background,
      formatter: function (params) {
        params.marker
        return `${params.marker} ${params.seriesName}: ${params.value}`
      }
    },
    legend: {
      data: [t('emailReceived'), t('emailSent')],
      top: '0',
      textStyle: {
        color: topic.value.color,  // 图例文字颜色
      }
    },
    grid: {
      left: '18',
      right: '18',
      bottom: '15',
      top: '50',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: emailColumnData.daysData,
      axisTick: {
        show: false,
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: topic.value.axisColor,
          width: 1,
        }
      },
    },
    yAxis: {
      max: (params) => {
        if (params.max < 8) {
          return 10
        }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: topic.value.splitLineColor,  // ← 横线颜色
          type: 'solid',    // dashed=虚线，solid=实线
          width: 1
        }
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: topic.value.axisColor,
          width: 0,
        }
      },
      type: 'value',
      boundaryGap: [0, 0.1],
    },
    series: [
      {
        name: t('emailReceived'),
        type: 'bar',
        stack: 'total', // 堆叠组标识（必须相同）
        barWidth: '60%',
        barMaxWidth: 30,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)',
          }
        },
        data: emailColumnData.receiveData,
        itemStyle: {
          color: topic.value.accent,
        }
      },
      {
        name: t('emailSent'),
        type: 'bar',
        stack: 'total',
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)'
          }
        },
        data: emailColumnData.sendData,
        itemStyle: {
          color: topic.value.accentSecondary,
        }
      }
    ]
  };

  emailColumn.setOption(option);
}

function createSendGauge() {
  if (sendGauge) {
    sendGauge.dispose()
  }
  sendGauge = echarts.init(document.querySelector(".send-count"));
  let option = {
    tooltip: {
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background
    },
    series: [{
      name: t('sentToday'),
      type: 'gauge',
      max: 100,
      // 进度条颜色（新增）
      progress: {
        show: true,
        roundCap: true,
        itemStyle: {
          color: topic.value.accent
        }
      },
      pointer: {
        itemStyle: {
          color: topic.value.accent
        }
      },
      axisLabel: {
        color: topic.value.gaugeSplitLine,
      },
      // 轴线背景色（新增）
      axisLine: {
        roundCap: true,
        lineStyle: {
          color: [[1, topic.value.containerBackground]]
        }
      },
      splitLine: {
        lineStyle: {
          color: topic.value.gaugeSplitLine, // 大刻度线颜色
        }
      },
      // 刻度颜色（新增）
      axisTick: {
        lineStyle: {
          color: topic.value.axisColor
        }
      },
      // 中心文字颜色（新增）
      detail: {
        valueAnimation: true,
        formatter: '{value}',
        color: topic.value.color // 黑色文字
      },
      data: [{
        value: daySendTotal,
        name: t('total'),
        // 名称标签颜色（新增）
        title: {
          color: topic.value.color  // 灰色标签
        }
      }]
    }],
    color: [topic.value.accent]
  };
  sendGauge.setOption(option);
}


</script>
<style>
.percentage-value {
  display: block;
  margin-top: 10px;
  font-size: 28px;
}

.percentage-label {
  display: block;
  margin-top: 10px;
  font-size: 12px;
}
</style>
<style scoped lang="scss">
.analysis-loading {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-outer {
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px 32px 56px;
  display: grid;
  gap: 20px;
  grid-auto-rows: min-content;
  @media (max-width: 960px)  { padding: 20px 24px 40px; gap: 14px; }
  @media (max-width: 640px)  { padding: 16px 16px 32px; }
}

/* ── Stat cards grid ── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  @media (max-width: 1200px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 768px)  { grid-template-columns: 1fr 1fr; }
  @media (max-width: 480px)  { grid-template-columns: 1fr; }
}

.stat-card {
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  padding: 24px;
  transition: border-color 0.16s ease;

  @media (hover: hover) {
    &:hover { border-color: var(--psg-border-strong); }
  }

  .stat-body {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .stat-left {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .stat-label {
    font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--psg-text-muted);
  }

  .stat-value {
    :deep(.el-statistic__number) {
      font-size: 30px !important;
      font-weight: 700 !important;
      letter-spacing: -0.02em !important;
      line-height: 1.1 !important;
    }
  }

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--psg-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-breakdown {
    display: flex;
    gap: 12px;
    margin-top: 14px;
    font-size: 12px;
    color: var(--psg-text-secondary);
  }

  .bd-normal { color: var(--psg-text-secondary); }
  .bd-del { color: var(--psg-text-muted); }
}

/* ── Chart cards ── */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
}

.chart-card {
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  padding: 20px;

  .chart-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--psg-text);
    margin: 0 0 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--psg-border);
  }

  .chart-area {
    height: 280px;
    @media (max-width: 640px) { height: 220px; }
    @media (max-width: 420px) { height: 180px; }
  }
}
</style>




















