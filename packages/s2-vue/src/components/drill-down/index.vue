<script lang="ts">
import { defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import {
  DRILL_DOWN_PRE_CLASS,
  type BaseDrillDownDataSet,
  type BaseDrillDownComponentProps,
} from '@antv/s2';
import { Button, Input, Empty, Menu, MenuItem } from 'ant-design-vue';
import type { SelectInfo } from 'ant-design-vue/lib/menu/src/interface';
import { isEmpty } from 'lodash';
import type { Key } from 'ant-design-vue/lib/_util/type';
import type { ChangeEvent } from 'ant-design-vue/lib/_util/EventInterface';
import LocationIcon from '../../icons/location-icon.vue';
import TextIcon from '../../icons/text-icon.vue';
import CalendarIcon from '../../icons/calendar-icon.vue';
import {
  initDrillDownEmits,
  initDrillDownProps,
} from '../../utils/initPropAndEmits';

export default defineComponent({
  name: 'DrillDown',
  props: initDrillDownProps(),
  emits: initDrillDownEmits(),
  methods: {},
  components: {
    Button,
    Input,
    Empty,
    Menu,
    MenuItem,
    LocationIcon,
    TextIcon,
    CalendarIcon,
  },
  setup(props) {
    const {
      dataSet,
      disabledFields,
      getDrillFields,
      setDrillFields,
      className,
    } = props as BaseDrillDownComponentProps;
    const getOptions = () =>
      dataSet.map((val: BaseDrillDownDataSet) => {
        val.disabled = !!(disabledFields && disabledFields.includes(val.value));

        return val;
      });

    const options: Ref<BaseDrillDownDataSet[]> = ref(getOptions());
    const selected = ref<Key[]>([]);

    const handleSearch = (e: ChangeEvent) => {
      const { value } = e.target;

      if (!value) {
        options.value = [...dataSet];
      } else {
        const reg = new RegExp(value, 'gi');
        const result = dataSet.filter((item) => reg.test(item.name));

        options.value = [...result];
      }
    };

    const handleSelect = (value: SelectInfo) => {
      const key = value?.selectedKeys;

      selected.value = key;
      if (getDrillFields) {
        getDrillFields(key as string[]);
      }

      if (setDrillFields) {
        setDrillFields(key as string[]);
      }
    };

    const handleClear = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      selected.value = [];
      if (getDrillFields) {
        getDrillFields([]);
      }

      if (setDrillFields) {
        setDrillFields([]);
      }
    };

    return {
      options,
      handleSearch,
      handleSelect,
      handleClear,
      className,
      selected,
      isEmpty,
      DRILL_DOWN_PRE_CLASS,
    };
  },
});
</script>

<template>
  <div :class="[DRILL_DOWN_PRE_CLASS, className]">
    <header :class="`${DRILL_DOWN_PRE_CLASS}-header`">
      <div>{{ title }}</div>
      <Button type="link" @click="handleClear">
        {{ clearText }}
      </Button>
    </header>
    <Input
      :class="`${DRILL_DOWN_PRE_CLASS}-search`"
      :placeholder="searchText"
      @change="handleSearch"
      @pressEnter="handleSearch"
      :allowClear="true"
    />
    <Empty
      v-if="isEmpty(options)"
      :imageStyle="{ height: '64px' }"
      :class="`${DRILL_DOWN_PRE_CLASS}-empty`"
    />
    <Menu
      class="`${DRILL_DOWN_PRE_CLASS}-menu`"
      v-model:selectedKeys="selected"
      @select="handleSelect"
    >
      <MenuItem
        v-for="option in options"
        :key="option.value"
        :disabled="option.disabled"
        :class="`${DRILL_DOWN_PRE_CLASS}-menu-item`"
      >
        <template #icon>
          <TextIcon v-if="option.type === 'text'" />
          <CalendarIcon v-if="option.type === 'date'" />
          <LocationIcon v-if="option.type === 'location'" />
        </template>
        {{ option?.name }}
      </MenuItem>
    </Menu>
  </div>
</template>

<style lang="less" scoped>
@import '@antv/s2/esm/shared/styles/drill-down.less';
</style>
