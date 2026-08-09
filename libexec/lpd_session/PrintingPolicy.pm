# Parses the root-owned installed manifest for the LPD session helper.
# The helper owns no endpoint, queue, timeout, or source-port defaults of its own.
package PrintingPolicy;
use strict;
use warnings;
use Exporter 'import';

our @EXPORT_OK = qw(load_installed parse_manifest);
use constant INSTALLED_PATH => '/private/etc/tm-u220/printing.conf';
use constant PROFILE_PATH => '/private/etc/tm-u220/printer.u220p';

my @BASE = qw(account_name account_uid printer_ipv4 profile_path profile_bytes
    profile_sha256 probe_mode probe_recorded_at);
my @ROUTES = qw(live_destination_port live_timeout_seconds live_source_ports
    lpd_queue lpd_destination_port lpd_timeout_seconds lpd_source_ports);
my %CONDITIONAL = (
    verified => [qw(probe_model probe_model_id)],
    offline => [qw(probe_error probe_acceptance)],
    deferred => [qw(probe_reason)],
);
my %ALLOWED = map { $_ => 1 } (@BASE, @ROUTES,
    map { @$_ } values %CONDITIONAL);

sub integer {
    my ($value, $label, $minimum, $maximum) = @_;
    die "$label must be a canonical integer\n"
        unless defined $value && $value =~ /^(?:0|[1-9]\d*)$/;
    my $number = 0 + $value;
    die "$label is outside its allowed range\n"
        if $number < $minimum || $number > $maximum;
    return $number;
}

sub timestamp {
    my ($value) = @_;
    my ($year, $month, $day, $hour, $minute, $second) = defined $value
        ? $value =~ /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{3}Z$/
        : ();
    return 0 unless defined $year && $month >= 1 && $month <= 12
        && $hour <= 23 && $minute <= 59 && $second <= 59;
    my $leap = $year % 4 == 0 && ($year % 100 != 0 || $year % 400 == 0);
    my @days = (0, 31, $leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31);
    return $day >= 1 && $day <= $days[$month];
}

sub ipv4 {
    my ($value) = @_;
    die "printer_ipv4 must be a canonical numeric IPv4 address\n"
        unless defined $value && $value =~ /^\d+\.\d+\.\d+\.\d+$/;
    my @parts = split /\./, $value;
    for my $part (@parts) {
        die "printer_ipv4 octets are invalid\n"
            if $part > 255 || ($part =~ /^0\d/);
    }
    my $private = $parts[0] == 10
        || ($parts[0] == 172 && $parts[1] >= 16 && $parts[1] <= 31)
        || ($parts[0] == 192 && $parts[1] == 168)
        || ($parts[0] == 169 && $parts[1] == 254);
    die "printer_ipv4 must be private or link-local\n" unless $private;
    return $value;
}

sub ports {
    my ($value, $label, $minimum, $maximum) = @_;
    die "$label must be a canonical comma-separated list\n"
        unless defined $value && $value =~ /^\d+(?:,\d+)*$/;
    my (@result, %seen);
    for my $text (split /,/, $value) {
        my $port = integer($text, $label, $minimum, $maximum);
        die "$label contains a duplicate\n" if $seen{$port}++;
        push @result, $port;
    }
    die "$label contains too many ports\n" if @result > 32;
    return \@result;
}

sub parse_manifest {
    my ($bytes) = @_;
    die "printing manifest is empty or too large\n"
        unless defined $bytes && length($bytes) > 0 && length($bytes) <= 4096;
    die "printing manifest contains forbidden bytes\n" if $bytes =~ /[\0\r]/;
    die "printing manifest must end with LF\n" unless $bytes =~ /\n\z/;
    my @lines = split /\n/, $bytes, -1;
    pop @lines;
    die "printing manifest header is invalid\n"
        unless shift(@lines) eq '!tm-u220 printing-policy 1';

    my (%fields, @order);
    for my $line (@lines) {
        my ($key, $value) = $line =~ /^([a-z][a-z0-9_]*)=(.+)$/;
        die "printing manifest contains an unknown or malformed field\n"
            unless defined $key && $ALLOWED{$key};
        die "printing manifest contains a duplicate field\n" if exists $fields{$key};
        $fields{$key} = $value;
        push @order, $key;
    }
    my $conditional = $CONDITIONAL{$fields{probe_mode} || ''}
        or die "printing manifest probe mode is invalid\n";
    my @expected = (@BASE, @$conditional, @ROUTES);
    die "printing manifest fields are not canonical\n"
        unless @order == @expected;
    for my $index (0 .. $#expected) {
        die "printing manifest fields are not canonical\n"
            unless $order[$index] eq $expected[$index];
    }

    die "printing manifest account is invalid\n"
        unless $fields{account_name} =~ /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
    integer($fields{account_uid}, 'account_uid', 1, 2147483647);
    my $host = ipv4($fields{printer_ipv4});
    die "printing manifest profile path is invalid\n"
        unless $fields{profile_path} eq PROFILE_PATH;
    integer($fields{profile_bytes}, 'profile_bytes', 1, 4096);
    die "printing manifest profile digest is invalid\n"
        unless $fields{profile_sha256} =~ /^[0-9a-f]{64}$/;
    die "printing manifest probe timestamp is invalid\n"
        unless timestamp($fields{probe_recorded_at});
    if ($fields{probe_mode} eq 'verified') {
        die "verified probe does not identify a TM-U220\n"
            unless $fields{probe_model} eq 'TM-U220' && $fields{probe_model_id} eq '13';
    }
    if ($fields{probe_mode} eq 'offline') {
        die "offline probe evidence is invalid\n"
            unless $fields{probe_error} =~ /^(?:timeout|connection_refused|unreachable|network_error)$/
                && $fields{probe_acceptance} eq 'allow_offline';
    }
    if ($fields{probe_mode} eq 'deferred') {
        die "deferred device check does not require the privileged source route\n"
            unless $fields{probe_reason} eq 'privileged_source_required';
    }
    my %fixed = (
        live_destination_port => '9100', live_timeout_seconds => '30',
        live_source_ports => '1023,1021,1020,1019,1018,1017,1016,1015',
        lpd_queue => 'lp', lpd_destination_port => '515', lpd_timeout_seconds => '5',
        lpd_source_ports => '731,730,729,728,727,726,725,724,723,722,721',
    );
    for my $key (keys %fixed) {
        die "$key differs from fixed printing policy\n"
            unless $fields{$key} eq $fixed{$key};
    }
    die "LPD queue is invalid\n" unless $fields{lpd_queue} eq 'lp';

    return {
        host => $host,
        queue => $fields{lpd_queue},
        destination_port => integer(
            $fields{lpd_destination_port}, 'lpd_destination_port', 1, 65535),
        timeout => integer(
            $fields{lpd_timeout_seconds}, 'lpd_timeout_seconds', 1, 300),
        source_ports => ports($fields{lpd_source_ports}, 'lpd_source_ports', 721, 731),
    };
}

sub load_installed {
    my $handle;
    unless (open $handle, '<:raw', INSTALLED_PATH) {
        die "cannot read installed printing manifest: $!\n";
    }
    local $/;
    my $bytes = <$handle>;
    close $handle or die "cannot close installed printing manifest: $!\n";
    return parse_manifest($bytes);
}

1;
