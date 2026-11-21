<?php
/**
 * إرسال بريد موازين عبر SMTP موثّق. بيانات الدخول تُنشأ وقت النشر في
 * mail-config.php من GitHub Secrets ولا تدخل المستودع أبداً.
 */

use PHPMailer\PHPMailer\PHPMailer;

function mailer_file(string $name): ?string {
    $candidates = [__DIR__ . "/$name", dirname(__DIR__) . "/$name"];
    foreach ($candidates as $file) {
        if (is_file($file)) return $file;
    }
    return null;
}

function send_mawazeen_email(string $email, string $name, string $subject, string $html): bool {
    $autoload = mailer_file('vendor/autoload.php');
    $configFile = mailer_file('mail-config.php');
    if (!$autoload || !$configFile) {
        error_log('mailer: SMTP configuration or Composer autoload is missing');
        return false;
    }

    require_once $autoload;
    $config = require $configFile;
    if (!is_array($config) || empty($config['username']) || empty($config['password'])) {
        error_log('mailer: SMTP credentials are missing');
        return false;
    }

    try {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = (string) ($config['host'] ?? 'smtp.hostinger.com');
        $mail->SMTPAuth = true;
        $mail->Username = (string) $config['username'];
        $mail->Password = (string) $config['password'];
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        $mail->Port = (int) ($config['port'] ?? 465);
        $mail->Timeout = 20;
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($mail->Username, 'موازين');
        $mail->addReplyTo($mail->Username, 'موازين');
        $mail->addAddress($email, $name);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $html;
        $mail->AltBody = trim(html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html)), ENT_QUOTES, 'UTF-8'));
        return $mail->send();
    } catch (Throwable $error) {
        error_log('mailer: SMTP send failed: ' . $error->getMessage());
        return false;
    }
}
