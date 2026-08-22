<template>
  <el-dropdown trigger="click" :teleported="teleported" popper-class="access-mgmt-more-menu">
    <button type="button" class="more-menu-trigger" :aria-label="ariaLabel" @click.stop>
      <span class="more-dots"><span/><span/><span/></span>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <slot />
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup>
defineProps({
  ariaLabel: { type: String, default: 'More actions' },
  teleported: { type: Boolean, default: true },
})
</script>

<style scoped lang="scss">
.more-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: 1px solid transparent;
  border-radius: var(--psg-radius-sm);
  background: transparent;
  color: var(--psg-text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-active); color: var(--psg-text); }
  }
}

.more-dots {
  display: flex;
  align-items: center;
  gap: 3px;

  span {
    display: block;
    width: 3.5px;
    height: 3.5px;
    border-radius: 50%;
    background: currentColor;
  }
}
</style>
