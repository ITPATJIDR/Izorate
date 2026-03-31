use std::net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Check if a binary exists in PATH
fn is_binary_available(name: &str) -> bool {
    #[cfg(windows)]
    {
        std::process::Command::new("where")
            .arg(name)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("which")
            .arg(name)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

// ───────────────────────── PING ─────────────────────────

/// Implementation mode for network tools
#[derive(serde::Deserialize, Clone, Copy, PartialEq)]
pub enum ImplementationMode {
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "native")]
    Native,
    #[serde(rename = "fallback")]
    Fallback,
}

/// Try OS binary ping, fallback to TCP-based ping or respect explicit mode
pub async fn ping(app: &AppHandle, host: &str, count: u32, mode: ImplementationMode) -> Result<(), String> {
    let use_native = match mode {
        ImplementationMode::Native => true,
        ImplementationMode::Fallback => false,
        ImplementationMode::Auto => is_binary_available("ping"),
    };

    if use_native {
        ping_with_binary(app, host, count).await
    } else {
        if mode == ImplementationMode::Auto {
            app.emit("ping-result", format!("⚠ 'ping' not found — using TCP ping fallback"))
                .map_err(|e| e.to_string())?;
        }
        ping_tcp_fallback(app, host, count).await
    }
}

async fn ping_with_binary(app: &AppHandle, host: &str, count: u32) -> Result<(), String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let mut cmd = Command::new("ping");
    #[cfg(windows)]
    {
        cmd.arg("-n").arg(count.to_string());
    }
    #[cfg(not(windows))]
    {
        cmd.arg("-c").arg(count.to_string());
    }

    let mut child = cmd
        .arg(host)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ping: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        app.emit("ping-result", line).map_err(|e| e.to_string())?;
    }
    let _ = child.wait().await;
    Ok(())
}

async fn ping_tcp_fallback(app: &AppHandle, host: &str, count: u32) -> Result<(), String> {
    // Resolve host to IP
    let ip = resolve_host(host)?;
    let common_ports = [443, 80, 22];

    // Find first reachable port
    let target_port = {
        let mut found = None;
        for port in &common_ports {
            let addr = SocketAddr::new(ip, *port);
            if TcpStream::connect_timeout(&addr, Duration::from_secs(1)).is_ok() {
                found = Some(*port);
                break;
            }
        }
        found.ok_or_else(|| format!("TCP ping: no open port found on {} (tried {:?})", host, common_ports))?
    };

    app.emit(
        "ping-result",
        format!("TCP PING {} ({}) port {} — {} probes", host, ip, target_port, count),
    )
    .map_err(|e| e.to_string())?;

    let addr = SocketAddr::new(ip, target_port);
    let mut success_count = 0u32;
    let mut total_time = Duration::ZERO;
    let mut min_time = Duration::MAX;
    let mut max_time = Duration::ZERO;

    for seq in 1..=count {
        let start = Instant::now();
        match TcpStream::connect_timeout(&addr, Duration::from_secs(2)) {
            Ok(_stream) => {
                let rtt = start.elapsed();
                success_count += 1;
                total_time += rtt;
                if rtt < min_time {
                    min_time = rtt;
                }
                if rtt > max_time {
                    max_time = rtt;
                }
                app.emit(
                    "ping-result",
                    format!(
                        "seq={} port={} time={:.2}ms",
                        seq,
                        target_port,
                        rtt.as_secs_f64() * 1000.0
                    ),
                )
                .map_err(|e| e.to_string())?;
            }
            Err(e) => {
                app.emit(
                    "ping-result",
                    format!("seq={} port={} error: {}", seq, target_port, e),
                )
                .map_err(|e| e.to_string())?;
            }
        }
        // Wait between probes
        if seq < count {
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    // Summary
    let loss = ((count - success_count) as f64 / count as f64 * 100.0) as u32;
    app.emit(
        "ping-result",
        format!(
            "--- {} TCP ping statistics ---\n{} probes, {} successful, {}% loss",
            host, count, success_count, loss
        ),
    )
    .map_err(|e| e.to_string())?;

    if success_count > 0 {
        let avg = total_time / success_count;
        app.emit(
            "ping-result",
            format!(
                "rtt min/avg/max = {:.2}/{:.2}/{:.2} ms",
                min_time.as_secs_f64() * 1000.0,
                avg.as_secs_f64() * 1000.0,
                max_time.as_secs_f64() * 1000.0
            ),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ───────────────────────── TRACEROUTE ─────────────────────────

/// Try OS binary traceroute, fallback to TCP-based traceroute or respect explicit mode
pub async fn traceroute(app: &AppHandle, host: &str, mode: ImplementationMode) -> Result<(), String> {
    let bin = if cfg!(windows) { "tracert" } else { "traceroute" };
    
    let use_native = match mode {
        ImplementationMode::Native => true,
        ImplementationMode::Fallback => false,
        ImplementationMode::Auto => is_binary_available(bin),
    };

    if use_native {
        traceroute_with_binary(app, host).await
    } else {
        if mode == ImplementationMode::Auto {
            app.emit(
                "traceroute-result",
                format!("⚠ '{}' not found — using TCP traceroute fallback", bin),
            )
            .map_err(|e| e.to_string())?;
        }
        traceroute_tcp_fallback(app, host).await
    }
}

async fn traceroute_with_binary(app: &AppHandle, host: &str) -> Result<(), String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    #[cfg(windows)]
    let mut cmd = Command::new("tracert");
    #[cfg(not(windows))]
    let mut cmd = Command::new("traceroute");

    #[cfg(windows)]
    {
        cmd.arg("-d");
    }
    #[cfg(not(windows))]
    {
        cmd.arg("-n").arg("-w").arg("1").arg("-q").arg("1");
    }

    let mut child = cmd
        .arg(host)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let bin = if cfg!(windows) { "tracert" } else { "traceroute" };
            format!("Failed to start {}: {}", bin, e)
        })?;

    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        app.emit("traceroute-result", line)
            .map_err(|e| e.to_string())?;
    }
    let _ = child.wait().await;
    Ok(())
}

async fn traceroute_tcp_fallback(app: &AppHandle, host: &str) -> Result<(), String> {
    use socket2::{Domain, Protocol, Socket, Type};

    let dest_ip = resolve_host(host)?;
    let target_port: u16 = 80; // Common port for TCP traceroute
    let max_hops: u32 = 30;
    let timeout = Duration::from_secs(2);

    app.emit(
        "traceroute-result",
        format!("traceroute to {} ({}), {} hops max", host, dest_ip, max_hops),
    )
    .map_err(|e| e.to_string())?;

    let domain = match dest_ip {
        IpAddr::V4(_) => Domain::IPV4,
        IpAddr::V6(_) => Domain::IPV6,
    };

    for ttl in 1..=max_hops {
        let start = Instant::now();

        // Create a TCP socket with specific TTL
        let socket = Socket::new(domain, Type::STREAM, Some(Protocol::TCP))
            .map_err(|e| e.to_string())?;

        // Set TTL
        socket.set_ttl(ttl).map_err(|e| e.to_string())?;
        socket.set_nonblocking(true).map_err(|e| e.to_string())?;

        let sock_addr: SocketAddr = SocketAddr::new(dest_ip, target_port);
        let sock_addr2: socket2::SockAddr = sock_addr.into();

        // Attempt connection (will fail with TTL expired or succeed at destination)
        let _ = socket.connect(&sock_addr2);

        // Wait for result with timeout using poll
        let elapsed = start.elapsed();
        if elapsed < timeout {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        // Try to get the peer or check error
        let rtt = start.elapsed();

        // Check if we connected (means we reached the destination)
        match socket.peer_addr() {
            Ok(_) => {
                // Reached the destination
                app.emit(
                    "traceroute-result",
                    format!(
                        " {:>2}  {}  {:.3} ms",
                        ttl,
                        dest_ip,
                        rtt.as_secs_f64() * 1000.0
                    ),
                )
                .map_err(|e| e.to_string())?;
                break;
            }
            Err(e) => {
                let error_kind = e.raw_os_error().unwrap_or(0);
                // Different OSes report TTL exceeded differently
                // Generally: EHOSTUNREACH (113 Linux, 65 macOS), ENETUNREACH (101 Linux, 51 macOS)
                // or ECONNREFUSED means we reached the host but port is closed (still reached it)
                #[cfg(target_os = "linux")]
                let is_host_reached = error_kind == 111; // ECONNREFUSED
                #[cfg(target_os = "macos")]
                let is_host_reached = error_kind == 61; // ECONNREFUSED
                #[cfg(target_os = "windows")]
                let is_host_reached = error_kind == 10061; // WSAECONNREFUSED
                #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
                let is_host_reached = false;

                if is_host_reached {
                    app.emit(
                        "traceroute-result",
                        format!(
                            " {:>2}  {}  {:.3} ms",
                            ttl,
                            dest_ip,
                            rtt.as_secs_f64() * 1000.0
                        ),
                    )
                    .map_err(|e| e.to_string())?;
                    break;
                } else if rtt >= timeout {
                    app.emit("traceroute-result", format!(" {:>2}  *  *  *", ttl))
                        .map_err(|e| e.to_string())?;
                } else {
                    // Got a TTL-exceeded style response — we can infer a hop exists
                    // but TCP doesn't give us the intermediate router IP easily
                    // Just report the timing
                    app.emit(
                        "traceroute-result",
                        format!(" {:>2}  *  {:.3} ms", ttl, rtt.as_secs_f64() * 1000.0),
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }

        drop(socket);
    }

    Ok(())
}

// ───────────────────────── PORT SCAN ─────────────────────────

/// Use netstat2 crate — pure Rust, cross-platform port listing
pub fn get_listening_ports() -> Result<Vec<serde_json::Value>, String> {
    use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};

    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;

    let sockets = get_sockets_info(af_flags, proto_flags).map_err(|e| e.to_string())?;

    let mut ports = Vec::new();
    for si in sockets {
        match &si.protocol_socket_info {
            ProtocolSocketInfo::Tcp(tcp) => {
                // Only include LISTEN state
                if tcp.state == netstat2::TcpState::Listen {
                    ports.push(serde_json::json!({
                        "protocol": "TCP",
                        "port": tcp.local_port,
                        "address": tcp.local_addr.to_string()
                    }));
                }
            }
            ProtocolSocketInfo::Udp(udp) => {
                ports.push(serde_json::json!({
                    "protocol": "UDP",
                    "port": udp.local_port,
                    "address": udp.local_addr.to_string()
                }));
            }
        }
    }

    // Sort by port number
    ports.sort_by(|a, b| {
        let pa = a["port"].as_u64().unwrap_or(0);
        let pb = b["port"].as_u64().unwrap_or(0);
        pa.cmp(&pb)
    });

    // Deduplicate
    ports.dedup_by(|a, b| a["port"] == b["port"] && a["protocol"] == b["protocol"] && a["address"] == b["address"]);

    Ok(ports)
}

// ───────────────────────── TOOL AVAILABILITY ─────────────────────────

/// Returns which tools use native binary vs fallback
pub async fn check_availability() -> serde_json::Value {
    let trace_bin = if cfg!(windows) { "tracert" } else { "traceroute" };
    
    // Perform detection in a separate task to avoid blocking if the OS is slow
    let (ping_avail, trace_avail) = tokio::task::spawn_blocking(move || {
        (is_binary_available("ping"), is_binary_available(trace_bin))
    }).await.unwrap_or((false, false));

    serde_json::json!({
        "ping": {
            "native": ping_avail,
            "fallback": "TCP ping"
        },
        "traceroute": {
            "native": trace_avail,
            "fallback": "TCP traceroute"
        },
        "ports": {
            "native": true,
            "fallback": null
        }
    })
}

// ───────────────────────── HELPERS ─────────────────────────

fn resolve_host(host: &str) -> Result<IpAddr, String> {
    // Try parsing as IP first
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok(ip);
    }
    // DNS resolve
    let addrs: Vec<_> = format!("{}:0", host)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed for '{}': {}", host, e))?
        .collect();

    addrs
        .first()
        .map(|a| a.ip())
        .ok_or_else(|| format!("No addresses found for '{}'", host))
}
