<template>
  <div v-if="analysisLoading" class="analysis-loading">
    <loading/>
  </div>
  <div v-else class="page-outer" :key="boxKey">

    <!-- ── Header ── -->
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ $t('analyticsTitle') }}</h1>
        <p class="page-subtitle">
          {{ $t('analyticsSubtitle', { date: headerDate, mail: (receiveTotal + sendTotal).toLocaleString(), mailbox: accountTotal.toLocaleString() }) }}
        </p>
      </div>
      <div class="header-toolbar">
        <div class="range-toggle">
          <button type="button" class="range-btn" :class="{ active: rangeDays === 7 }" @click="rangeDays = 7">
            {{ $t('rangeDays', { n: 7 }) }}
          </button>
          <button type="button" class="range-btn" :class="{ active: rangeDays === 14 }" @click="rangeDays = 14">
            {{ $t('rangeDays', { n: 14 }) }}
          </button>
        </div>
        <button type="button" class="icon-btn" :title="$t('refreshData')" :disabled="refreshing" @click="refresh">
          <Icon icon="psg:refresh" width="17" height="17" :class="{ spinning: refreshing }"/>
        </button>
        <button type="button" class="icon-btn" :title="$t('exportData')" @click="exportCsv">
          <Icon icon="psg:download" width="17" height="17"/>
        </button>
      </div>
    </div>

    <!-- ── Stat cards ── -->
    <div class="stat-grid">
      <section class="stat-card">
        <div class="stat-row-top">
          <span class="stat-label">{{ $t('totalReceived') }}</span>
        </div>
        <div class="stat-row-value">
          <div class="stat-value">
            <el-statistic :formatter="value => Math.round(value)" :value="receiveData"/>
          </div>
          <div class="stat-delta-wrap" v-if="receiveDelta">
            <span class="stat-delta" :class="deltaClass(receiveDelta)">
              <span class="delta-arrow"></span>{{ deltaLabel(receiveDelta) }}
            </span>
            <span class="delta-caption">{{ $t('vsLastWeek') }}</span>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalReceiveTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delReceiveTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>

      <section class="stat-card">
        <div class="stat-row-top">
          <span class="stat-label">{{ $t('totalSent') }}</span>
        </div>
        <div class="stat-row-value">
          <div class="stat-value">
            <el-statistic :formatter="value => Math.round(value)" :value="sendData"/>
          </div>
          <div class="stat-delta-wrap" v-if="sendDelta">
            <span class="stat-delta" :class="deltaClass(sendDelta)">
              <span class="delta-arrow"></span>{{ deltaLabel(sendDelta) }}
            </span>
            <span class="delta-caption">{{ $t('vsLastWeek') }}</span>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalSendTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delSendTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>

      <section class="stat-card">
        <div class="stat-row-top">
          <span class="stat-label">{{ $t('totalMailboxes') }}</span>
        </div>
        <div class="stat-row-value">
          <div class="stat-value">
            <el-statistic :formatter="value => Math.round(value)" :value="accountData"/>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalAccountTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delAccountTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>

      <section class="stat-card">
        <div class="stat-row-top">
          <span class="stat-label">{{ $t('totalUsers') }}</span>
        </div>
        <div class="stat-row-value">
          <div class="stat-value">
            <el-statistic :formatter="value => Math.round(value)" :value="userData"/>
          </div>
          <div class="stat-delta-wrap" v-if="userDelta">
            <span class="stat-delta" :class="deltaClass(userDelta)">
              <span class="delta-arrow"></span>{{ deltaLabel(userDelta) }}
            </span>
            <span class="delta-caption">{{ $t('vsLastWeek') }}</span>
          </div>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalUserTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delUserTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>
    </div>

    <!-- ── Charts row 1 ── -->
    <div class="chart-grid chart-grid--lead-narrow">
      <section class="chart-card chart-card--source">
        <div class="chart-head">
          <div>
            <h2 class="chart-title">{{ $t('emailSource') }}</h2>
            <p class="chart-subtitle">{{ $t('emailSourceSubtitle') }}</p>
          </div>
        </div>
        <div class="source-body" v-if="senderData && senderData.length">
          <ul class="source-list">
            <li v-for="(item, idx) in senderData" :key="item.name + idx" class="source-row">
              <span class="source-rank">{{ idx + 1 }}</span>
              <div class="source-info">
                <div class="source-line">
                  <span class="source-name" :title="item.name">{{ item.name }}</span>
                  <span class="source-pct">{{ senderPct(item) }}%</span>
                </div>
                <div class="source-bar-track">
                  <div class="source-bar-fill" :style="{ width: senderBarWidth(item) + '%', background: sourceColor(idx) }"></div>
                </div>
              </div>
              <span class="source-value">{{ item.value }}</span>
            </li>
          </ul>
        </div>
        <div v-else class="chart-empty">
          <Icon icon="psg:analytics" width="26" height="26"/>
          <span>{{ $t('noAnalyticsData') }}</span>
        </div>
      </section>

      <section class="chart-card">
        <div class="chart-head">
          <div>
            <h2 class="chart-title">{{ $t('userGrowth') }}</h2>
            <p class="chart-subtitle">{{ $t('userGrowthSubtitle', { n: rangeDays }) }}</p>
          </div>
        </div>
        <div class="increase-line chart-area"></div>
      </section>
    </div>

    <!-- ── Charts row 2 ── -->
    <div class="chart-grid chart-grid--lead-wide">
      <section class="chart-card">
        <div class="chart-head">
          <div>
            <h2 class="chart-title">{{ $t('emailGrowth') }}</h2>
            <p class="chart-subtitle">{{ $t('emailTrafficSubtitle', { n: rangeDays }) }}</p>
          </div>
        </div>
        <div class="email-column chart-area chart-area--main"></div>
      </section>

      <section class="chart-card chart-card--ring">
        <div class="chart-head">
          <div>
            <h2 class="chart-title">{{ $t('sentToday') }}</h2>
          </div>
        </div>
        <div class="ring-body">
          <div class="ring-figure">
            <span class="ring-value">
              <el-statistic :formatter="value => Math.round(value)" :value="daySendAnimated"/>
            </span>
            <span class="ring-label">{{ $t('insightSentToday') }}</span>
          </div>
          <div class="ring-track" :style="{ '--ring-pct': ringClamped }" role="presentation">
            <div class="ring-fill"></div>
          </div>
          <div class="ring-meta">
            <div class="ring-meta-row">
              <span class="ring-meta-label">{{ $t('sevenDayAvg') }}</span>
              <span class="ring-meta-value">{{ Math.round(avgSend7) }}</span>
            </div>
            <div class="ring-meta-row">
              <span class="ring-meta-label">{{ $t('vsSevenDayAvg') }}</span>
              <span class="ring-meta-value" :class="ringPct >= 100 ? 'delta-up' : 'delta-down'">
                {{ ringPct >= 100 ? '+' : '' }}{{ Math.round(ringPct - 100) }}%
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Operational insights ── -->
    <section class="chart-card insights-card">
      <div class="chart-head">
        <div>
          <h2 class="chart-title">{{ $t('insightsTitle') }}</h2>
          <p class="chart-subtitle">{{ $t('insightsSubtitle', { n: 14 }) }}</p>
        </div>
      </div>
      <div class="insights-grid">
        <div class="insight-item">
          <span class="insight-label">{{ $t('insightSentToday') }}</span>
          <span class="insight-value">{{ daySendTotal.toLocaleString() }}</span>
          <span class="insight-delta" :class="ringPct >= 100 ? 'delta-up' : 'delta-down'">
            {{ ringPct >= 100 ? '+' : '' }}{{ Math.round(ringPct - 100) }}% {{ $t('vsSevenDayAvg') }}
          </span>
        </div>
        <div class="insight-item">
          <span class="insight-label">{{ $t('insightReceiveTrend') }}</span>
          <span class="insight-value">{{ receiveLast7Total.toLocaleString() }}</span>
          <span class="insight-delta" :class="deltaClass(receiveDelta)">
            {{ deltaLabel(receiveDelta) }} {{ $t('vsLastWeek') }}
          </span>
        </div>
        <div class="insight-item">
          <span class="insight-label">{{ $t('insightUserTrend') }}</span>
          <span class="insight-value">{{ userLast7Total.toLocaleString() }}</span>
          <span class="insight-delta" :class="deltaClass(userDelta)">
            {{ deltaLabel(userDelta) }} {{ $t('vsLastWeek') }}
          </span>
        </div>
      </div>
    </section>

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

const {t, locale} = useI18n();
const route = useRoute();
const uiStore = useUiStore()

const receiveTotal = ref(0)
const sendTotal = ref(0)
const accountTotal = ref(0)
const userTotal = ref(0)
const daySendTotal = ref(0)
const analysisLoading = ref(true)
const refreshing = ref(false)
const rangeDays = ref(14)

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

const receiveData = useTransition(receiveTotal, {duration: 1500})
const sendData = useTransition(sendTotal, {duration: 1500})
const accountData = useTransition(accountTotal, {duration: 1500})
const userData = useTransition(userTotal, {duration: 1500})
const daySendAnimated = useTransition(daySendTotal, {duration: 1200})

const senderData = ref([])
const userSeries = ref([])
const receiveSeries = ref([])
const sendSeries = ref([])

const headerDate = computed(() => locale.value === 'en' ? dayjs().format('MMM D, YYYY') : dayjs().format('YYYY年M月D日'))

const topic = computed(() => ({
  // Proof palette, mirrored from tokens.css (echarts draws on canvas and
  // cannot resolve CSS var()). Charts sit on the white --psg-surface sheet.
  color: uiStore.dark ? '#EDEDEF' : '#18181B',
  background: uiStore.dark ? '#161618' : '#FFFFFF',
  borderColor: uiStore.dark ? '#262629' : '#E6E6E9',
  scaleLineColor: uiStore.dark ? '#262629' : '#EDEDF0',
  crossColor: uiStore.dark ? '#3A3A3F' : '#CFCFD4',
  axisColor: uiStore.dark ? '#8A8A91' : '#6B6B72',
  splitLineColor: uiStore.dark ? '#262629' : '#EDEDF0',
  accentGreen: uiStore.dark ? '#F4B6C6' : '#B04A6A',
  accentGreenRgb: uiStore.dark ? '244, 182, 198' : '176, 74, 106',
  // Secondary series — a neutral step, so the accent stays the one colour
  accentSecondary: uiStore.dark ? '#4A4A50' : '#CFCFD4',
  monoFont: "'JetBrains Mono', ui-monospace, monospace",
}))

let leaveWidth = 0
let senderPie = null
let increaseLine = null
let emailColumn = null
let first = true
let boxKey = ref(0)
let analysisDark = uiStore.dark

// ── Derived analytics (all computed from real API data — nothing fabricated) ──

function weekOverWeek(arr) {
  if (!arr || arr.length < 14) return null
  const last7 = arr.slice(-7).reduce((s, d) => s + d.total, 0)
  const prev7 = arr.slice(-14, -7).reduce((s, d) => s + d.total, 0)
  if (prev7 === 0) return last7 === 0 ? {pct: 0, flat: true} : {pct: null, isNew: true}
  return {pct: Math.round(((last7 - prev7) / prev7) * 100)}
}

function deltaClass(d) {
  if (!d) return 'delta-flat'
  if (d.isNew) return 'delta-up'
  if (d.flat) return 'delta-flat'
  return d.pct > 0 ? 'delta-up' : d.pct < 0 ? 'delta-down' : 'delta-flat'
}

function deltaLabel(d) {
  if (!d) return '—'
  if (d.isNew) return t('newVsLastWeek')
  if (d.flat) return t('flatVsLastWeek')
  return `${d.pct > 0 ? '+' : ''}${d.pct}%`
}


const receiveDelta = computed(() => weekOverWeek(receiveSeries.value))
const sendDelta = computed(() => weekOverWeek(sendSeries.value))
const userDelta = computed(() => weekOverWeek(userSeries.value))

const receiveLast7Total = computed(() => receiveSeries.value.slice(-7).reduce((s, d) => s + d.total, 0))
const userLast7Total = computed(() => userSeries.value.slice(-7).reduce((s, d) => s + d.total, 0))


const avgSend7 = computed(() => {
  const arr = sendSeries.value.slice(-7)
  if (!arr.length) return 0
  return arr.reduce((s, d) => s + d.total, 0) / arr.length
})
const ringPct = computed(() => avgSend7.value > 0 ? (daySendTotal.value / avgSend7.value * 100) : (daySendTotal.value > 0 ? 100 : 0))
const ringClamped = computed(() => Math.max(0, Math.min(100, Math.round(ringPct.value))))

const senderTotalCount = computed(() => senderData.value.reduce((s, d) => s + d.value, 0))
const senderMaxValue = computed(() => senderData.value.reduce((m, d) => Math.max(m, d.value), 0) || 1)

function senderPct(item) {
  return senderTotalCount.value ? Math.round(item.value / senderTotalCount.value * 100) : 0
}

function senderBarWidth(item) {
  return Math.round(item.value / senderMaxValue.value * 100)
}

// The leading sender carries the accent; the rest are one neutral step.
function sourceColor(idx) {
  return idx === 0 ? 'var(--psg-primary)' : 'var(--psg-border-strong)'
}

// ── Data loading ──

async function loadData() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const data = await analysisEcharts(timeZone)

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

  senderData.value = data.receiveRatio.nameRatio.map(item => ({
    name: item.name || ' ',
    value: item.total
  }))

  userSeries.value = data.userDayCount.slice(-14)
  receiveSeries.value = data.emailDayCount.receiveDayCount.slice(-14)
  sendSeries.value = data.emailDayCount.sendDayCount.slice(-14)
  daySendTotal.value = data.daySendTotal

  initPicture();
  first = false
}

onMounted(() => {
  loadData().finally(() => {
    analysisLoading.value = false
  })
})

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await loadData()
  } finally {
    refreshing.value = false
  }
}

function exportCsv() {
  const len = Math.max(receiveSeries.value.length, sendSeries.value.length, userSeries.value.length)
  const rows = [['date', 'received', 'sent', 'newUsers']]
  for (let i = 0; i < len; i++) {
    rows.push([
      receiveSeries.value[i]?.date || sendSeries.value[i]?.date || userSeries.value[i]?.date || '',
      receiveSeries.value[i]?.total ?? '',
      sendSeries.value[i]?.total ?? '',
      userSeries.value[i]?.total ?? ''
    ])
  }
  rows.push([])
  rows.push(['metric', 'value'])
  rows.push(['totalReceived', receiveTotal.value])
  rows.push(['totalSent', sendTotal.value])
  rows.push(['totalMailboxes', accountTotal.value])
  rows.push(['totalUsers', userTotal.value])
  rows.push(['sentToday', daySendTotal.value])

  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `psg-mail-analytics-${dayjs().format('YYYY-MM-DD')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const widthChange = debounce(initPicture, 500, {
  leading: false,
  trailing: true
})

watch(() => uiStore.asideShow, () => {
  if (window.innerWidth > 1024) {
    widthChange()
  }
})

watch(rangeDays, () => {
  initPicture()
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

const onResize = () => { widthChange() }
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
    createEmailColumnChart()
  })
}

function createSenderPie() {
  if (senderPie) {
    senderPie.dispose()
  }
  const el = document.querySelector(".sender-pie")
  if (!el) return
  senderPie = echarts.init(el)
  const option = {
    tooltip: {
      trigger: 'item',
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background,
      borderColor: topic.value.splitLineColor,
      borderWidth: 1,
      formatter: params => {
        return `${params.marker} ${params.name}： ${params.value} (${params.percent}%)`;
      }
    },
    series: [
      {
        data: senderData.value,
        name: '',
        type: 'pie',
        radius: ['64%', '88%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: topic.value.background,
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          scaleSize: 6
        },
        labelLine: {
          show: false
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

  const el = document.querySelector(".increase-line")
  if (!el) return
  increaseLine = echarts.init(el)

  const windowed = userSeries.value.slice(-rangeDays.value)
  const xdata = windowed.map(d => dayjs(d.date).format("M.D"))
  const sdata = windowed.map(d => d.total)

  let option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: topic.value.crossColor
        },
        axis: 'x',
      },
      formatter: function (params) {
        let result = ''
        params.forEach(item => {
          result = `${item.marker} ${t('dailyNewUsers')}: ${item.value}`;
        });
        return result;
      },
      backgroundColor: topic.value.background,
      borderColor: topic.value.splitLineColor,
      borderWidth: 1,
      padding: 10,
      textStyle: {
        color: topic.value.color,
      }
    },
    grid: {
      top: '8%',
      right: '16',
      left: '35',
      bottom: '30'
    },
    xAxis: {
      type: 'category',
      data: xdata,
      boundaryGap: false,
      axisTick: {
        show: false,
      },
      axisPointer: {
        label: {
          show: false
        }
      },
      axisLine: {
        lineStyle: {
          color: topic.value.crossColor,
          width: 1,
          type: 'solid'
        }
      },
      axisLabel: {
        color: topic.value.axisColor,
        fontFamily: topic.value.monoFont,
        fontSize: 11,
        formatter: function (value, index) {
          if (index === 0) {
            return '  ' + value;
          }
          if (index === xdata.length - 1) {
            return value + '  '
          }
          return value;
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: topic.value.axisColor,
        fontFamily: topic.value.monoFont,
        fontSize: 11,
        margin: 8,
      },
      boundaryGap: [0, 0.15],
      max: (params) => {
        if (params.max < 8) {
          return 10
        }
      },
      axisLine: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'solid',
          color: topic.value.scaleLineColor
        }
      }
    },
    series: [
      {
        data: sdata,
        type: 'line',
        smooth: 0.15,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        itemStyle: {
          color: topic.value.accentGreen,
          borderWidth: 2,
          borderColor: topic.value.background
        },
        lineStyle: {
          color: topic.value.accentGreen,
          width: 2
        },
        areaStyle: {
          color: `rgba(${topic.value.accentGreenRgb}, 0.06)`
        },
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

  const el = document.querySelector(".email-column")
  if (!el) return
  emailColumn = echarts.init(el);

  const rWindow = receiveSeries.value.slice(-rangeDays.value)
  const sWindow = sendSeries.value.slice(-rangeDays.value)
  const daysData = rWindow.map(d => dayjs(d.date).format("M.D"))

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background,
      borderColor: topic.value.splitLineColor,
      borderWidth: 1,
      formatter: function (params) {
        return params.map(p => `${p.marker} ${p.seriesName}: ${p.value}`).join('<br/>')
      }
    },
    legend: {
      data: [t('emailReceived'), t('emailSent')],
      top: '0',
      right: '0',
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
      textStyle: {
        color: topic.value.axisColor,
        fontSize: 12,
      }
    },
    grid: {
      left: '18',
      right: '10',
      bottom: '15',
      top: '46',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: daysData,
      axisTick: {
        show: false,
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: topic.value.crossColor,
          width: 1,
        }
      },
      axisLabel: {
        color: topic.value.axisColor,
        fontFamily: topic.value.monoFont,
        fontSize: 11
      }
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
          color: topic.value.splitLineColor,
          type: 'solid',
        }
      },
      axisLine: {
        show: false
      },
      axisLabel: {
        color: topic.value.axisColor,
        fontFamily: topic.value.monoFont,
        fontSize: 11
      },
      type: 'value',
      boundaryGap: [0, 0.15],
    },
    series: [
      {
        name: t('emailReceived'),
        type: 'bar',
        barGap: '20%',
        barMaxWidth: 14,
        data: rWindow.map(d => d.total),
        itemStyle: {
          color: topic.value.accentGreen,
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: t('emailSent'),
        type: 'bar',
        barMaxWidth: 16,
        data: sWindow.map(d => d.total),
        itemStyle: {
          color: topic.value.accentSecondary,
          borderRadius: [2, 2, 0, 0]
        }
      }
    ]
  };

  emailColumn.setOption(option);
}

</script>
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
  padding: 40px 32px 64px;
  display: grid;
  gap: 24px;
  grid-auto-rows: min-content;
  @media (max-width: 960px)  { padding: 24px 24px 40px; gap: 16px; }
  @media (max-width: 640px)  { padding: 16px 16px 32px; }
}

/* ── Header ── */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;

  /* Phones: stack the title and the toolbar (this scoped rule outranks the
     shared one in styles/mobile.css, so it has to say so itself). */
  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}

.page-title {
  margin: 0;
  font-family: var(--psg-font-display);
  font-size: 32px;
  font-weight: 400;
  letter-spacing: -.01em;
  line-height: 40px;
  color: var(--psg-text);
  @media (max-width: 640px) { font-size: 26px; line-height: 32px; }
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--psg-text-secondary);
  font-variant-numeric: tabular-nums;
}

.header-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.range-toggle {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  background: var(--psg-surface-muted);
  border: 0;
  border-radius: var(--psg-radius-sm);
}

.range-btn {
  appearance: none;
  border: none;
  background: transparent;
  height: 28px;
  padding: 0 12px;
  font-family: var(--psg-font-mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--psg-text-muted);
  border-radius: var(--psg-radius-xs);
  cursor: pointer;
  transition: background-color var(--psg-dur-fast) var(--psg-ease), color var(--psg-dur-fast) var(--psg-ease);

  &:hover { color: var(--psg-text); }
  &.active {
    background: var(--psg-surface);
    color: var(--psg-text);
    box-shadow: var(--psg-shadow-xs);
  }
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface);
  color: var(--psg-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color var(--psg-dur-fast) var(--psg-ease), color var(--psg-dur-fast) var(--psg-ease), background-color var(--psg-dur-fast) var(--psg-ease);

  @media (hover: hover) {
    &:hover {
      border-color: var(--psg-border-strong);
      color: var(--psg-text);
    }
  }
  &:disabled { opacity: 0.5; cursor: default; }

  .spinning { animation: psg-spin 0.8s linear infinite; }
}

@keyframes psg-spin {
  to { transform: rotate(360deg); }
}

/* ── Stat band: four figures in one ruled strip ── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-lg);
  overflow: hidden;
  @media (max-width: 1024px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 480px)  { grid-template-columns: 1fr; }
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 24px;
  background: var(--psg-surface);
  box-shadow: -1px 0 0 var(--psg-border), 0 -1px 0 var(--psg-border);

  .stat-label {
    font-size: 13px;
    font-weight: 400;
    color: var(--psg-text-muted);
  }

  .stat-row-value {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .stat-value {
    :deep(.el-statistic__number) {
      font-size: 32px !important;
      font-weight: 500 !important;
      line-height: 40px !important;
      font-variant-numeric: tabular-nums;
      color: var(--psg-text) !important;
    }
  }

  .stat-delta-wrap {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 12px;
  }

  .stat-delta {
    font-family: var(--psg-font-mono);
    font-size: 12px;
    font-weight: 500;

    &.delta-up { color: var(--psg-success); }
    &.delta-down { color: var(--psg-danger); }
    &.delta-flat, &.delta-new { color: var(--psg-text-muted); }
  }

  .delta-arrow { display: none; }

  .delta-caption {
    font-size: 12px;
    color: var(--psg-text-muted);
  }

  .stat-breakdown {
    display: flex;
    gap: 12px;
    font-family: var(--psg-font-mono);
    font-size: 12px;
    color: var(--psg-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .bd-normal { color: var(--psg-text-secondary); }
  .bd-del { color: var(--psg-text-muted); }
}

/* ── Chart cards ── */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  @media (max-width: 900px) { grid-template-columns: 1fr !important; }

  &--lead-narrow { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
  &--lead-wide { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
}

.chart-card {
  background: var(--psg-surface);
  border-radius: var(--psg-radius-lg);
  border: 1px solid var(--psg-border);
  padding: 20px 24px 24px;

  .chart-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .chart-title {
    font-size: 15px;
    font-weight: 500;
    color: var(--psg-text);
    margin: 0;
  }

  .chart-subtitle {
    font-size: 13px;
    color: var(--psg-text-muted);
    margin: 2px 0 0;
  }

  .chart-area {
    height: 240px;
    @media (max-width: 640px) { height: 200px; }

    &--main {
      height: 320px;
      @media (max-width: 640px) { height: 240px; }
    }
  }

  .chart-empty {
    height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--psg-text-muted);

    span {
      font-size: 13px;
      font-weight: 400;
    }
  }
}

/* ── Email source: ranked list with thin bars ── */
.source-body {
  display: flex;
  flex-direction: column;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.source-rank {
  width: 16px;
  flex-shrink: 0;
  font-family: var(--psg-font-mono);
  font-size: 12px;
  color: var(--psg-text-muted);
}

.source-info {
  flex: 1;
  min-width: 0;
}

.source-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.source-name {
  font-size: 13px;
  color: var(--psg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-pct {
  font-family: var(--psg-font-mono);
  font-size: 12px;
  color: var(--psg-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.source-bar-track {
  height: 4px;
  border-radius: 2px;
  background: var(--psg-surface-muted);
  overflow: hidden;
}

.source-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width var(--psg-dur-enter) var(--psg-ease);
}

.source-value {
  flex-shrink: 0;
  min-width: 32px;
  text-align: right;
  font-family: var(--psg-font-mono);
  font-size: 12px;
  color: var(--psg-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Today's sending: one figure against the seven-day average ── */
.chart-card--ring {
  display: flex;
  flex-direction: column;
}

.ring-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
}

.ring-figure {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ring-value {
  :deep(.el-statistic__number) {
    font-size: 48px !important;
    font-weight: 400 !important;
    line-height: 52px !important;
    font-family: var(--psg-font-display);
    color: var(--psg-text) !important;
    font-variant-numeric: tabular-nums;
  }
}

.ring-label {
  font-size: 13px;
  color: var(--psg-text-muted);
}

.ring-track {
  --ring-pct: 0;
  height: 6px;
  border-radius: 3px;
  background: var(--psg-surface-muted);
  overflow: hidden;
}

.ring-fill {
  width: calc(var(--ring-pct) * 1%);
  height: 100%;
  border-radius: 3px;
  background: var(--psg-primary);
  transition: width var(--psg-dur-enter) var(--psg-ease);
}

.ring-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--psg-border);
}

.ring-meta-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ring-meta-label {
  font-size: 12px;
  color: var(--psg-text-muted);
}

.ring-meta-value {
  font-size: 20px;
  font-weight: 500;
  color: var(--psg-text);
  font-variant-numeric: tabular-nums;

  &.delta-up { color: var(--psg-success); }
  &.delta-down { color: var(--psg-danger); }
}

/* ── Operational insights: a short ruled table of three ── */
.insights-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  @media (max-width: 767px) { grid-template-columns: 1fr; }
}

.insight-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 24px;
  background: transparent;
  border: 0;

  &:first-child { padding-left: 0; }
  & + & { border-left: 1px solid var(--psg-border); }

  @media (max-width: 767px) {
    padding: 12px 0;
    & + & { border-left: 0; border-top: 1px solid var(--psg-border); }
  }
}

.insight-label {
  font-size: 13px;
  font-weight: 400;
  color: var(--psg-text-muted);
}

.insight-value {
  font-size: 24px;
  font-weight: 500;
  line-height: 32px;
  color: var(--psg-text);
  font-variant-numeric: tabular-nums;
}

.insight-delta {
  font-family: var(--psg-font-mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--psg-text-muted);

  &.delta-up { color: var(--psg-success); }
  &.delta-down { color: var(--psg-danger); }
  &.delta-flat { color: var(--psg-text-muted); }
}
</style>
