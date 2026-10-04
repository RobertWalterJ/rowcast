# Blender: top-down rowing shell sprites (1x, 2x, 4x, 8+), bow pointing up, transparent PNG.
# usage: blender -b -P shells.py -- <outdir>
import bpy, sys, math
from mathutils import Vector

outdir = sys.argv[sys.argv.index("--") + 1]
BOATS = {  # length m, beam m, rowers, sculling?, cox
    "1x": (8.2, 0.30, 1, True, False),
    "2x": (10.0, 0.38, 2, True, False),
    "4x": (13.4, 0.50, 4, True, False),
    "8+": (17.5, 0.58, 8, False, True),
}


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=0.35, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def hull(L, B):
    # lofted hull: elliptical sections along a pointed plan-form
    n, ring = 64, 16
    verts, faces = [], []
    for i in range(n + 1):
        t = i / n
        x = (t - 0.5) * L
        # plan-form: fine entry and run, widest a bit aft of centre
        half = B / 2 * (math.sin(math.pi * t) ** 0.85) * (1 - 0.15 * (t - 0.45))
        depth = half * 0.7
        for k in range(ring):
            a = math.pi * k / (ring - 1)  # 0..pi : lower half-ellipse + deck
            verts.append((half * math.cos(a), x, -depth * math.sin(a)))
    for i in range(n):
        for k in range(ring - 1):
            a0 = i * ring + k
            faces.append((a0, a0 + 1, a0 + ring + 1, a0 + ring))
    me = bpy.data.meshes.new("hull"); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new("hull", me); bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def deck(L, B):
    # flat deck plate slightly inset, with long cockpit opening stripes added separately
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.002))
    d = bpy.context.object; d.scale = (B * 0.82, L * 0.9, 1)
    return d


def cyl(p1, p2, r, m):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(p1 + p2) / 2, vertices=12)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    o.data.materials.append(m)
    return o


def blade(pos, angle, m, size):
    bpy.ops.mesh.primitive_plane_add(size=1, location=pos)
    o = bpy.context.object
    o.scale = (size * 0.5, size * 0.21, 1); o.rotation_euler = (0, 0, angle)
    o.data.materials.append(m)
    return o


def build(key):
    L, B, n, scull, cox = BOATS[key]
    clear()
    sc = bpy.context.scene
    white = mat("hull", (0.94, 0.95, 0.96), 0.25)
    deckm = mat("deck", (0.07, 0.36, 0.47), 0.4)
    metal = mat("rig", (0.55, 0.58, 0.6), 0.3, 0.8)
    shaft = mat("shaft", (0.08, 0.09, 0.1), 0.5)
    bladem = mat("blade", (0.98, 0.78, 0.12), 0.35)  # visible blade colour
    seat = mat("seat", (0.15, 0.15, 0.17), 0.6)

    h = hull(L, B); h.data.materials.append(white)
    # coloured deck stripe along the centreline (bow and stern decks)
    for y0, y1 in ((L * 0.5 * 0.92, L * 0.18), (-L * 0.5 * 0.92, -L * 0.30)):
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, (y0 + y1) / 2, 0.004))
        s = bpy.context.object; s.scale = (B * 0.18, abs(y0 - y1), 1); s.data.materials.append(deckm)

    span = L * 0.48
    stations = [(-span / 2 + span * (i + 0.5) / n) for i in range(n)]
    if n == 1:
        stations = [-L * 0.06]
    oar_len = 2.88 if scull else 3.75
    rig_out = 0.80 if scull else 0.86
    for i, y in enumerate(stations):
        # seat
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y - 0.18, 0.03))
        st = bpy.context.object; st.scale = (B * 0.45, 0.24, 0.02); st.data.materials.append(seat)
        sides = (-1, 1) if scull else ((-1,) if i % 2 == 0 else (1,))
        for sd in sides:
            pin = (sd * rig_out, y + 0.05, 0.25)
            cyl((sd * B * 0.45, y + 0.25, 0.02), pin, 0.012, metal)
            cyl((sd * B * 0.45, y - 0.25, 0.02), pin, 0.012, metal)
            # oar squared out, slightly toward stern (catch-to-finish mid position)
            ang = math.radians(78)
            inboard = 0.88 if scull else 1.14
            outboard = oar_len - inboard
            hand = (pin[0] - sd * inboard * math.sin(ang), pin[1] + inboard * math.cos(ang) * 0.3, 0.27)
            tip = (pin[0] + sd * outboard * math.sin(ang), pin[1] - outboard * math.cos(ang), 0.2)
            cyl(hand, tip, 0.018, shaft)
            blade((tip[0] - sd * 0.22, tip[1] + 0.03, 0.21), math.atan2(tip[1] - pin[1], tip[0] - pin[0]), bladem, 0.5 if scull else 0.58)
    if cox:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -span / 2 - 0.9, 0.05))
        c = bpy.context.object; c.scale = (B * 0.5, 0.7, 0.05); c.data.materials.append(seat)

    # camera + light
    cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"
    extent = max(L * 1.04, (rig_out + oar_len) * 2.1)
    cam.ortho_scale = extent
    co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
    co.location = (0, 0, 50); co.rotation_euler = (0, 0, 0)
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.2
    so = bpy.data.objects.new("sun", sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(30), math.radians(-20), 0)
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    sc.render.engine = "CYCLES"; sc.cycles.samples = 32; sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x = 512; sc.render.resolution_y = 512
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = f"{outdir}/shell_{key.replace('+', 'p')}.png"
    bpy.ops.render.render(write_still=True)
    print("SHELL", key, "extent", extent)


for k in BOATS:
    build(k)
