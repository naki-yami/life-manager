import React from 'react';
import { Card, CardBody, CardHeader } from '../ui';
import { FocusTimer } from './FocusTimer';
import { useFocusSession } from './useFocusSession';
import { formatFocusDuration } from '../../utils/focus';

/**
 * 首页上的专注卡片：今天专注了几次、多久，以及一个可以立刻开车的番茄钟。
 * 时间轴（排在几点）在「今日计划」页，这里只留「现在就做」。
 */
export const FocusCard: React.FC = () => {
  const focus = useFocusSession();

  return (
    <Card>
      <CardHeader
        title="专注"
        subtitle={
          focus.today.count > 0
            ? `今天已专注 ${focus.today.count} 次、共 ${formatFocusDuration(focus.today.minutes)}`
            : '挑一件事，从番茄钟开始'
        }
      />
      <CardBody>
        <FocusTimer
          active={focus.active}
          options={focus.options}
          onStart={focus.start}
          onFinish={focus.finish}
          onCancel={focus.cancel}
        />
      </CardBody>
    </Card>
  );
};
