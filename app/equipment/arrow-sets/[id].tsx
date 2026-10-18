import { useMemo } from 'react';

import { EquipmentAdapter, EquipmentScreen } from '@/components/equipment-screen';
import type { components } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { ARROW_SET_FIELDS } from '@/lib/equipment-fields';

type Body = components['schemas']['ArrowSetRequest'];

export default function ArrowSetScreen() {
  const { api } = useAuth();
  const adapter = useMemo<EquipmentAdapter>(
    () => ({
      load: async (id) => (await api.GET('/api/arrow-sets/{id}/', { params: { path: { id } } })).data ?? null,
      revisions: async (id) =>
        (await api.GET('/api/arrow-sets/{id}/revisions/', { params: { path: { id } } })).data ?? [],
      create: async (payload) => {
        const { data, error } = await api.POST('/api/arrow-sets/', { body: payload as Body });
        return data ? null : errorMessage(error);
      },
      update: async (id, payload) => {
        const { data, error } = await api.PATCH('/api/arrow-sets/{id}/', { params: { path: { id } }, body: payload });
        return data ? null : errorMessage(error);
      },
      remove: async (id) => {
        const { response, error } = await api.DELETE('/api/arrow-sets/{id}/', { params: { path: { id } } });
        return response.ok ? null : errorMessage(error);
      },
    }),
    [api],
  );
  return <EquipmentScreen label="arrow set" fields={ARROW_SET_FIELDS} adapter={adapter} />;
}
