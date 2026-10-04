import { test, expect } from '@playwright/test';

for (const path of ['/', '/demandas', '/clientes', '/equipe', '/integracao', '/ajuda']) {
  test(`sem sessão, ${path} redireciona para o login e oculta o painel`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('heading', { name: 'Entrar no Ikaros Vision' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByText('Entradas no período', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Explorar demonstração' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('modo de demonstração armazenado não contorna o login', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('ikaros-bi-mode', 'demo'));
  await page.goto('/clientes');
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole('heading', { name: 'Entrar no Ikaros Vision' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('login mobile mostra email, senha e entrada sem navegação privada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
});
