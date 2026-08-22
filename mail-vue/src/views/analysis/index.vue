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
          <div class="stat-icon"><Icon icon="psg:inbox" width="20" height="20"/></div>
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
        <div class="stat-visual">
          <svg class="spark" viewBox="0 0 68 28" preserveAspectRatio="none">
            <path :d="receiveSpark.area" class="spark-area"/>
            <path :d="receiveSpark.line" class="spark-line"/>
          </svg>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalReceiveTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delReceiveTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>

      <section class="stat-card">
        <div class="stat-row-top">
          <span class="stat-label">{{ $t('totalSent') }}</span>
          <div class="stat-icon"><Icon icon="psg:send" width="20" height="20"/></div>
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
        <div class="stat-visual">
          <svg class="spark" viewBox="0 0 68 28" preserveAspectRatio="none">
            <path :d="sendSpark.area" class="spark-area"/>
            <path :d="sendSpark.line" class="spark-line"/>
          </svg>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalSendTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delSendTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>

      <section class="stat-card">
        <div class="stat-row-top">
          <span class="stat-label">{{ $t('totalMailboxes') }}</span>
          <div class="stat-icon"><Icon icon="psg:all-mail" width="20" height="20"/></div>
        </div>
        <div class="stat-row-value">
          <div class="stat-value">
            <el-statistic :formatter="value => Math.round(value)" :value="accountData"/>
          </div>
        </div>
        <div class="stat-visual">
          <div class="composition-bar">
            <div class="comp-normal" :style="{ width: accountNormalPct + '%' }"></div>
            <div class="comp-del" :style="{ width: accountDelPct + '%' }"></div>
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
          <div class="stat-icon"><Icon icon="psg:group" width="20" height="20"/></div>
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
        <div class="stat-visual">
          <svg class="spark" viewBox="0 0 68 28" preserveAspectRatio="none">
            <path :d="userSpark.area" class="spark-area"/>
            <path :d="userSpark.line" class="spark-line"/>
          </svg>
        </div>
        <div class="stat-breakdown">
          <span class="bd-normal">{{ numberCount.normalUserTotal }} {{ $t('active') }}</span>
          <span class="bd-del">{{ numberCount.delUserTotal }} {{ $t('deleted') }}</span>
        </div>
      </section>
    </div>

    <!-- ── Charts row 1 ── -->
    <div class="chart-grid">
      <section class="chart-card chart-card--source">
        <div class="chart-head">
          <div>
            <h2 class="chart-title">{{ $t('emailSource') }}</h2>
            <p class="chart-subtitle">{{ $t('emailSourceSubtitle') }}</p>
          </div>
        </div>
        <div class="source-body" v-if="senderData && senderData.length">
          <div class="source-donut">
            <div class="sender-pie chart-area"></div>
            <div class="donut-center">
              <span class="donut-total">{{ senderTotalCount.toLocaleString() }}</span>
              <span class="donut-caption">{{ $t('emailSourceTotal', { n: senderData.length }) }}</span>
            </div>
          </div>
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
    <div class="chart-grid">
      <section class="chart-card">
        <div class="chart-head">
          <div>
            <h2 class="chart-title">{{ $t('emailGrowth') }}</h2>
            <p class="chart-subtitle">{{ $t('emailTrafficSubtitle', { n: rangeDays }) }}</p>
          </div>
        </div>
        <div class="email-column chart-area"></div>
      </section>

      <section class="chart-card chart-card--ring">
        <div class="chart-head">
          <div>
            <h2 class="chart-title">{{ $t('sentToday') }}</h2>
          </div>
        </div>
        <div class="ring-body">
          <div class="ring-visual" :style="{ '--ring-pct': ringClamped }">
            <div class="ring-inner">
              <span class="ring-value">
                <el-statistic :formatter="value => Math.round(value)" :value="daySendAnimated"/>
              </span>
              <span class="ring-label">{{ $t('insightSentToday') }}</span>
            </div>
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
  color: uiStore.dark ? '#E5EAF3' : '#303133',
  background: uiStore.dark ? '#141414' : '#FFFFFF',
  borderColor: uiStore.dark ? '#141414' : '#FFFFFF',
  scaleLineColor: uiStore.dark ? '#636466' : '#CDD0D6',
  crossColor: uiStore.dark ? '#8D9095' : '#A8ABB2',
  axisColor: uiStore.dark ? '#A3A6AD' : '#909399',
  splitLineColor: uiStore.dark ? '#58585B' : '#D4D7DE',
  // Brand accent for echarts (canvas-rendered — cannot resolve CSS var(),
  // so mirror tokens.css's --psg-primary light/dark values here directly)
  accentGreen: uiStore.dark ? '#45B67D' : '#1E5940',
  accentGreenRgb: uiStore.dark ? '69, 182, 125' : '30, 89, 64',
  // Secondary series color — grayscale, for the non-primary metric only
  accentSecondary: uiStore.dark ? '#8A8A85' : '#A3A3A3',
  categoryPalette: uiStore.dark
    ? ['#45B67D', '#C7C7C2', '#9C9C97', '#727270', '#4D4D4B', '#2E2E2C']
    : ['#1E5940', '#3D3D3D', '#666666', '#8C8C8C', '#B3B3B3', '#D9D9D9'],
}))

let leaveWidth = 0
let senderPie = null
let increaseLine = null
let emailColumn = null
let first = true
let boxKey = ref(0)
let analysisDark = uiStore.dark

// ── Derived analytics (all computed from real API data — nothing fabricated) ──

function buildSparkline(values, w = 68, h = 28) {
  if (!values || values.length < 2) return {line: '', area: ''}
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = (max - min) || 1
  const stepX = w / (values.length - 1)
  const pts = values.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 4) - 2])
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  const area = line + ` L${w},${h} L0,${h} Z`
  return {line, area}
}

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

const receiveSpark = computed(() => buildSparkline(receiveSeries.value.slice(-7).map(d => d.total)))
const sendSpark = computed(() => buildSparkline(sendSeries.value.slice(-7).map(d => d.total)))
const userSpark = computed(() => buildSparkline(userSeries.value.slice(-7).map(d => d.total)))

const receiveDelta = computed(() => weekOverWeek(receiveSeries.value))
const sendDelta = computed(() => weekOverWeek(sendSeries.value))
const userDelta = computed(() => weekOverWeek(userSeries.value))

const receiveLast7Total = computed(() => receiveSeries.value.slice(-7).reduce((s, d) => s + d.total, 0))
const userLast7Total = computed(() => userSeries.value.slice(-7).reduce((s, d) => s + d.total, 0))

const accountNormalPct = computed(() => accountTotal.value ? Math.round(numberCount.normalAccountTotal / accountTotal.value * 100) : 0)
const accountDelPct = computed(() => accountTotal.value ? Math.max(0, 100 - accountNormalPct.value) : 0)

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

function sourceColor(idx) {
  const palette = topic.value.categoryPalette
  return palette[idx % palette.length]
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
          color: topic.value.axisColor,
          width: 1,
          type: 'solid'
        }
      },
      axisLabel: {
        color: topic.value.axisColor,
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
          type: 'dashed',
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
          width: 2.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: `rgba(${topic.value.accentGreenRgb}, 0.28)`
            },
            {
              offset: 1,
              color: `rgba(${topic.value.accentGreenRgb}, 0.02)`
            }
          ])
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
      itemWidth: 10,
      itemHeight: 10,
      icon: 'circle',
      textStyle: {
        color: topic.value.color,
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
          color: topic.value.axisColor,
          width: 1,
        }
      },
      axisLabel: {
        color: topic.value.axisColor
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
          type: 'dashed',
        }
      },
      axisLine: {
        show: false
      },
      axisLabel: {
        color: topic.value.axisColor
      },
      type: 'value',
      boundaryGap: [0, 0.15],
    },
    series: [
      {
        name: t('emailReceived'),
        type: 'bar',
        barGap: '30%',
        barMaxWidth: 16,
        data: rWindow.map(d => d.total),
        itemStyle: {
          color: topic.value.accentGreen,
          borderRadius: [3, 3, 0, 0]
        }
      },
      {
        name: t('emailSent'),
        type: 'bar',
        barMaxWidth: 16,
        data: sWindow.map(d => d.total),
        itemStyle: {
          color: topic.value.accentSecondary,
          borderRadius: [3, 3, 0, 0]
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
  padding: 24px 32px 56px;
  display: grid;
  gap: 20px;
  grid-auto-rows: min-content;
  @media (max-width: 960px)  { padding: 20px 24px 40px; gap: 14px; }
  @media (max-width: 640px)  { padding: 16px 16px 32px; }
}

/* ── Header ── */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--psg-border);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--psg-text);
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--psg-text-secondary);
}

.header-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.range-toggle {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
}

.range-btn {
  appearance: none;
  border: none;
  background: transparent;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  border-radius: calc(var(--psg-radius-sm) - 2px);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;

  &:hover { color: var(--psg-text); }
  &.active {
    background: var(--psg-primary);
    color: var(--psg-on-primary);
  }
}

.icon-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface);
  color: var(--psg-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.12s, color 0.12s, background 0.12s;

  @media (hover: hover) {
    &:hover {
      border-color: var(--psg-border-strong);
      color: var(--psg-text);
      background: var(--psg-surface-active);
    }
  }
  &:disabled { opacity: 0.5; cursor: default; }

  .spinning { animation: psg-spin 0.8s linear infinite; }
}

@keyframes psg-spin {
  to { transform: rotate(360deg); }
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
  padding: 22px;
  transition: border-color 0.16s ease;

  @media (hover: hover) {
    &:hover { border-color: var(--psg-border-strong); }
  }

  .stat-row-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .stat-label {
    font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--psg-text-muted);
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--psg-radius-sm);
    background: var(--psg-primary-muted);
    color: var(--psg-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-row-value {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .stat-value {
    :deep(.el-statistic__number) {
      font-size: 28px !important;
      font-weight: 700 !important;
      letter-spacing: -0.02em !important;
      line-height: 1.1 !important;
    }
  }

  .stat-delta-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-delta {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    font-weight: 700;

    &.delta-up { color: var(--psg-primary); }
    &.delta-down { color: var(--psg-danger); }
    &.delta-flat, &.delta-new { color: var(--psg-text-muted); }
  }

  .delta-arrow {
    width: 0;
    height: 0;
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
    border-bottom: 5px solid currentColor;
  }
  .delta-down .delta-arrow { transform: rotate(180deg); }
  .delta-flat .delta-arrow, .delta-new .delta-arrow { display: none; }

  .delta-caption {
    font-size: 11px;
    color: var(--psg-text-muted);
  }

  .stat-visual {
    margin: 12px 0 10px;
  }

  .spark {
    width: 100%;
    height: 28px;
    display: block;
  }
  .spark-area { fill: var(--psg-primary-muted); stroke: none; }
  .spark-line {
    fill: none;
    stroke: var(--psg-primary);
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .composition-bar {
    display: flex;
    height: 6px;
    border-radius: var(--psg-radius-full);
    overflow: hidden;
    background: var(--psg-surface-active);
  }
  .comp-normal { background: var(--psg-primary); height: 100%; }
  .comp-del { background: var(--psg-text-muted); height: 100%; opacity: 0.45; }

  .stat-breakdown {
    display: flex;
    gap: 12px;
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

  .chart-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--psg-border);
  }

  .chart-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--psg-text);
    margin: 0;
  }

  .chart-subtitle {
    font-size: 12px;
    color: var(--psg-text-muted);
    margin: 4px 0 0;
  }

  .chart-area {
    height: 280px;
    @media (max-width: 640px) { height: 220px; }
    @media (max-width: 420px) { height: 180px; }
  }

  .chart-empty {
    height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--psg-text-muted);

    span {
      font-size: 13px;
      font-weight: 500;
    }

    @media (max-width: 640px) { height: 220px; }
    @media (max-width: 420px) { height: 180px; }
  }
}

/* ── Email source: donut + ranked list ── */
.source-body {
  display: flex;
  align-items: center;
  gap: 20px;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
  }
}

.source-donut {
  position: relative;
  width: 168px;
  height: 168px;
  flex-shrink: 0;

  @media (max-width: 640px) { align-self: center; }

  .chart-area { width: 100%; height: 100%; }
}

.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
  text-align: center;
}

.donut-total {
  font-size: 22px;
  font-weight: 700;
  color: var(--psg-text);
  letter-spacing: -0.01em;
}

.donut-caption {
  font-size: 10.5px;
  color: var(--psg-text-muted);
  max-width: 96px;
}

.source-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-width: 0;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.source-rank {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
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
  font-size: 12.5px;
  color: var(--psg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-pct {
  font-size: 12px;
  color: var(--psg-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.source-bar-track {
  height: 5px;
  border-radius: var(--psg-radius-full);
  background: var(--psg-surface-active);
  overflow: hidden;
}

.source-bar-fill {
  height: 100%;
  border-radius: var(--psg-radius-full);
  transition: width 0.5s ease;
}

.source-value {
  flex-shrink: 0;
  min-width: 30px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Today's sending: progress ring ── */
.chart-card--ring {
  display: flex;
  flex-direction: column;
}

.ring-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.ring-visual {
  --ring-pct: 0;
  position: relative;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  flex-shrink: 0;
  background: conic-gradient(var(--psg-primary) calc(var(--ring-pct) * 1%), var(--psg-surface-active) 0);
  transition: background 0.6s ease;
}

.ring-inner {
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: var(--psg-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.ring-value {
  :deep(.el-statistic__number) {
    font-size: 26px !important;
    font-weight: 700 !important;
    color: var(--psg-text) !important;
  }
}

.ring-label {
  font-size: 11px;
  color: var(--psg-text-muted);
  font-weight: 500;
}

.ring-meta {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-width: 140px;
}

.ring-meta-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ring-meta-label {
  font-size: 11px;
  color: var(--psg-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ring-meta-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--psg-text);

  &.delta-up { color: var(--psg-primary); }
  &.delta-down { color: var(--psg-danger); }
}

/* ── Operational insights ── */
.insights-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  @media (max-width: 768px) { grid-template-columns: 1fr; }
}

.insight-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  background: var(--psg-surface-muted);
  border-radius: var(--psg-radius-sm);
  border: 1px solid var(--psg-border);
}

.insight-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--psg-text-muted);
}

.insight-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--psg-text);
  font-variant-numeric: tabular-nums;
}

.insight-delta {
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-muted);

  &.delta-up { color: var(--psg-primary); }
  &.delta-down { color: var(--psg-danger); }
  &.delta-flat { color: var(--psg-text-muted); }
}
</style>
