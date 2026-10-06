-- Server reminders run every minute, including when all browsers are closed.
SELECT cron.schedule('ikaros-vision-tasks','* * * * *','SELECT public.task_reminder_tick();');
SELECT public.task_reminder_tick();
