# Blender relief shading: DEM -> displaced mesh -> orthographic sun render (Cycles)
# usage: blender -b -P relief.py -- <dem.npy> <out.png> <exaggeration> <cell_m>
import bpy, sys, math
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
dem_path, out_path, exag, cell = argv[0], argv[1], float(argv[2]), float(argv[3])
dem = np.load(dem_path).astype(np.float64)
step = max(1, int(max(dem.shape) / 700))
dem = dem[::step, ::step]
H, W = dem.shape
cell *= step
dem = (dem - dem.min()) * exag

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# mesh grid in metres, origin centred
xs = (np.arange(W) - W / 2) * cell
ys = (H / 2 - np.arange(H)) * cell
verts = [(float(xs[j]), float(ys[i]), float(dem[i, j])) for i in range(H) for j in range(W)]
faces = [(i * W + j, i * W + j + 1, (i + 1) * W + j + 1, (i + 1) * W + j) for i in range(H - 1) for j in range(W - 1)]
me = bpy.data.meshes.new("dem"); me.from_pydata(verts, [], faces); me.update()
ob = bpy.data.objects.new("dem", me); sc.collection.objects.link(ob)
for p in me.polygons:
    p.use_smooth = True
mat = bpy.data.materials.new("m"); mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.8, 0.8, 0.8, 1); bsdf.inputs["Roughness"].default_value = 1.0
ob.data.materials.append(mat)

# camera: orthographic, straight down, framing the mesh exactly
cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"; cam.ortho_scale = max(W, H) * cell
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0, 0, float(dem.max()) + 5000); co.rotation_euler = (0, 0, 0)
cam.clip_end = 20000

# key light from NW (cartographic convention) + soft sky fill
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 4.0; sun.angle = math.radians(8)
so = bpy.data.objects.new("sun", sun); sc.collection.objects.link(so)
alt, az = math.radians(38), math.radians(315)
so.rotation_euler = (math.radians(90) - alt, 0, -az + math.radians(180))
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55

sc.render.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.use_denoising = True
sc.cycles.device = "CPU"
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = W * 2 if W >= H else int(W * 2 * 1)
sc.render.resolution_y = H * 2
sc.render.resolution_percentage = 100
# ortho scale fits the larger dimension; match aspect
if W >= H:
    sc.render.resolution_x = 1400; sc.render.resolution_y = int(1400 * H / W)
else:
    sc.render.resolution_y = 1400; sc.render.resolution_x = int(1400 * W / H)
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "BW"
sc.render.filepath = out_path
bpy.ops.render.render(write_still=True)
print("RELIEF DONE", out_path)
