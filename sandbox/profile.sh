for tool_bin in /mise/installs/*/*/bin /mise/installs/*/*/*/bin; do
	[ -d "$tool_bin" ] || continue
	PATH="$tool_bin:$PATH"
done
export PATH
