import { test, expect } from '@playwright/test';

test('sem conexão não mostra métricas fictícias como produção', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Notion não conectado' })).toBeVisible();
  await expect(page.getByText('Entradas no período', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explorar demonstração' })).toBeVisible();
});

test('demonstração, navegação, filtro, detalhe e saída', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorar demonstração' }).click();
  await expect(page.getByText('Modo demonstração', { exact: true })).toBeVisible();
  await expect(page.getByText('Entradas no período', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Demandas', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Demandas', exact: true })).toBeVisible();
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Clientes', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Equipe', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Equipe', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Integração', exact: true }).first().click();
  await expect(page.getByText('Modo demonstração (sem Notion)')).toBeVisible();
  await page.getByRole('link', { name: 'Ajuda e glossário' }).first().click();
  await expect(page.getByRole('heading', { name: 'Ajuda e glossário' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair da demonstração' }).click();
  await page.getByRole('link', { name: 'Visão geral', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Notion não conectado' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('layout mobile mantém navegação e período', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorar demonstração' }).click();
  await expect(page.getByRole('link', { name: 'Demandas', exact: true }).last()).toBeVisible();
  await page.getByRole('radio', { name: 'Hoje', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
});
