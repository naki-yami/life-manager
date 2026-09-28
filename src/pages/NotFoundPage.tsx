import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, EmptyState } from '../components/ui';

/** 404：给出回首页的出口，避免用户卡在空白页 */
export const NotFoundPage: React.FC = () => (
  <EmptyState
    icon={<Compass size={28} />}
    title="找不到这个页面"
    description="地址可能写错了，或者该功能已经调整。"
    action={
      <Link to="/">
        <Button>返回首页</Button>
      </Link>
    }
  />
);
