<template>
  <div v-for="i in rows" :key="i" class="mail-row-wrap">
    <div class="mail-row skel">
      <!-- Col 1: Avatar placeholder -->
      <div class="skel-avatar" />

      <!-- Col 2: Content -->
      <div class="skel-content">
        <div class="skel-row-1">
          <div class="skel-name" />
        </div>
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="text" class="skel-subject" />
          </template>
        </el-skeleton>
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="text" class="skel-preview" />
          </template>
        </el-skeleton>
        <template v-if="showUserInfo">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="text" class="skel-user" />
            </template>
          </el-skeleton>
        </template>
      </div>

      <!-- Col 3: Right -->
      <div class="skel-right">
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="text" class="skel-time" />
          </template>
        </el-skeleton>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  rows:        { type: Number,  default: 1 },
  showStar:    { type: Boolean, default: true },
  accountShow: { type: Boolean, default: false },
  showStatus:  { type: Boolean, default: false },
  showUserInfo:{ type: Boolean, default: false },
  type:        { type: String,  default: '' },
})
</script>

<style lang="scss" scoped>
.mail-row-wrap {
  padding: 0 16px 8px;
}

.mail-row.skel {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 12px;
  min-height: 96px;
  padding: 14px;
  border-radius: var(--psg-radius-sm);
  background: transparent;
  pointer-events: none;
}

.skel-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-active);
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
  opacity: 0.6;
}

.skel-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  .skel-row-1 { display: flex; align-items: center; gap: 8px; }

  .skel-name {
    height: 16px;
    width: 120px;
    background: var(--psg-surface-active);
    border-radius: var(--psg-radius-sm);
    opacity: 0.7;
  }
}

.skel-subject { width: 75% !important; height: 14px !important; }
.skel-preview { width: 55% !important; height: 13px !important; }
.skel-user    { width: 160px !important; height: 12px !important; }

.skel-right {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.skel-time { width: 44px !important; height: 12px !important; }

:deep(.el-skeleton__item) { border-radius: var(--psg-radius-sm) !important; }
</style>
