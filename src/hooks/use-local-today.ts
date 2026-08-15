import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localISO } from '@/shared/date';

export function useLocalToday() {
  const [today, setToday] = useState(localISO);

  useEffect(() => {
    function updateDate() {
      setToday(localISO());
    }

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const midnightTimer = setTimeout(updateDate, nextMidnight.getTime() - now.getTime() + 250);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateDate();
    });

    return () => {
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, [today]);

  return today;
}
