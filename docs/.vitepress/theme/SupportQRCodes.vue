<script setup lang="ts">
import { withBase } from 'vitepress'

interface Props {
  title: string
  description: string
  note?: string
  sponsorUrl?: string
  sponsorLabel?: string
  alipayLabel?: string
  wechatLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  sponsorUrl: 'https://github.com/sponsors/Simon-He95',
  sponsorLabel: 'Sponsor on GitHub',
  alipayLabel: 'Alipay',
  wechatLabel: 'WeChat Pay',
})

const alipaySrc = withBase('/sponsor/zhifubao.jpg')
const wechatSrc = withBase('/sponsor/weixin.jpg')
</script>

<template>
  <section class="support-qrs">
    <div class="support-qrs__copy">
      <h2 class="support-qrs__title">
        {{ props.title }}
      </h2>
      <p class="support-qrs__description">
        {{ props.description }}
      </p>

      <a
        class="support-qrs__sponsor-btn"
        :href="props.sponsorUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg
          class="support-qrs__sponsor-icon"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M8 14.25l.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 15.848 15.848 0 0 1-1.794-1.238C4.005 11.81 2 9.983 2 7.5 2 5.088 3.827 3 6.25 3c.72 0 1.393.2 1.975.545.582-.345 1.255-.545 1.975-.545C12.673 3 14.5 5.088 14.5 7.5c0 2.483-2.005 4.317-3.515 5.494a15.848 15.848 0 0 1-1.794 1.238 7.152 7.152 0 0 1-.31.17l-.018.01-.008.004Z"
            fill="currentColor"
          />
        </svg>
        {{ props.sponsorLabel }}
      </a>
    </div>

    <div class="support-qrs__grid">
      <figure class="support-qrs__card">
        <div class="support-qrs__image-frame">
          <img
            class="support-qrs__image"
            :src="alipaySrc"
            :alt="`${props.alipayLabel} QR code`"
            loading="lazy"
          >
        </div>
        <figcaption class="support-qrs__label">
          {{ props.alipayLabel }}
        </figcaption>
      </figure>

      <figure class="support-qrs__card">
        <div class="support-qrs__image-frame">
          <img
            class="support-qrs__image"
            :src="wechatSrc"
            :alt="`${props.wechatLabel} QR code`"
            loading="lazy"
          >
        </div>
        <figcaption class="support-qrs__label">
          {{ props.wechatLabel }}
        </figcaption>
      </figure>
    </div>

    <p v-if="props.note" class="support-qrs__note">
      {{ props.note }}
    </p>
  </section>
</template>

<style scoped>
.support-qrs {
  margin: 1.5rem 0 2.25rem;
  padding: 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(61, 120, 255, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(255, 255, 255, 0.98));
}

.support-qrs__copy {
  text-align: center;
}

.support-qrs__title {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.25;
}

.support-qrs__description {
  max-width: 44rem;
  margin: 0.6rem auto 0;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}

.support-qrs__sponsor-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.15rem;
  padding: 0.55rem 1.35rem;
  border-radius: 999px;
  background: linear-gradient(180deg, #ea4aaa, #db61a2);
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1;
  text-decoration: none;
  box-shadow: 0 8px 20px rgba(219, 97, 162, 0.32);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.support-qrs__sponsor-btn:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(219, 97, 162, 0.42);
}

.support-qrs__sponsor-icon {
  width: 1.05em;
  height: 1.05em;
  flex-shrink: 0;
}

.support-qrs__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.25rem;
}

.support-qrs__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}

.support-qrs__image-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 320px;
  padding: 0.875rem;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.94), rgba(241, 245, 249, 0.9));
}

.support-qrs__image {
  width: auto;
  max-width: min(100%, 240px);
  max-height: 320px;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
}

.support-qrs__label {
  margin-top: 0.85rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.support-qrs__note {
  margin: 1rem auto 0;
  text-align: center;
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  line-height: 1.7;
}

.dark .support-qrs {
  background:
    radial-gradient(circle at top left, rgba(122, 162, 255, 0.16), transparent 36%),
    linear-gradient(180deg, rgba(16, 24, 40, 0.92), rgba(10, 15, 26, 0.98));
}

.dark .support-qrs__card {
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
}

.dark .support-qrs__sponsor-btn {
  box-shadow: 0 10px 28px rgba(219, 97, 162, 0.4);
}

.dark .support-qrs__image-frame {
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.82), rgba(15, 23, 42, 0.92));
}

@media (max-width: 640px) {
  .support-qrs {
    padding: 1rem;
    border-radius: 16px;
  }

  .support-qrs__grid {
    grid-template-columns: 1fr;
  }

  .support-qrs__card {
    padding: 0.875rem;
  }

  .support-qrs__image-frame {
    min-height: 260px;
    padding: 0.75rem;
  }

  .support-qrs__image {
    max-height: 260px;
  }
}
</style>
