<template>
  <ProfessionalAside />
</template>

<script setup>
import ProfessionalAside from './professional.vue'
</script>

<style>
@media (min-width: 1025px) {
  .pro-sidebar[data-collapsed="true"] .pro-account {
    flex-direction: column;
    justify-content: center;
    gap: 4px;
  }

  .pro-sidebar[data-collapsed="true"] .pro-collapse {
    display: inline-grid !important;
  }
}
</style>
