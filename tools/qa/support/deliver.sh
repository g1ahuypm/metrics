# deliver.sh ID FROMNAME FROMEMAIL SUBJECT BODY [INREPLYTO]
U=/var/tmp/mail/support@test.local; mkdir -p $U/new $U/cur $U/tmp
f=$U/new/$(date +%s%N).$1.local
{
echo "From: $2 <$3>"
echo "To: support@test.local"
echo "Subject: $4"
echo "Message-ID: <$1@customer.test>"
[ -n "$6" ] && echo "In-Reply-To: $6" && echo "References: $6"
echo "Date: $(date -R)"
echo "Content-Type: text/plain; charset=utf-8"
echo
echo -e "$5"
} > $f
chown -R vmail:vmail $U
